import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AIProvider } from "@/lib/ai/types";
import type { ResearchProvider } from "@/lib/research/types";
import { DomainError } from "@/lib/domain/errors";
import { deriveNextAction, PIPELINE_STAGES, derivePipelineProgress, type NextActionKey, type PipelineStage } from "@/lib/workspace/next-action";
import { loadWorkspace } from "@/lib/workspace/snapshot";
import { runResearchPipeline } from "@/lib/research/service";
import { recordSourceDecision, confirmSourceSet } from "@/lib/repositories/sources";
import { generateContentPlan } from "@/lib/planning/service";
import {
  generateArticleOptions,
  regenerateArticleOption,
  evaluateArticleVersion,
  autoReviseArticle,
  selectArticle,
  canAutoRevise,
} from "@/lib/articles/service";
import { generateChannelAssets, regenerateChannelAsset, evaluateChannelVersion } from "@/lib/channels/service";
import { createContentPackage } from "@/lib/packages/service";
import { listArtifactVersions } from "@/lib/repositories/content";
import { bestEffort } from "@/lib/notifications/action-error";
import { notifyAutoModeStep, notifyAutoModeFinished } from "@/lib/notifications/service";
import type { WorkspaceTab } from "@/lib/workspace/tabs";

type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];

/**
 * Auto mode performs the request's own next action, repeatedly, so a run can
 * go from a bare topic through to a finished package without someone sitting
 * over it.
 *
 * It is a driver over `deriveNextAction`, not a second pipeline: the same
 * function the Overview and the dashboard read decides what happens next, so
 * auto mode can never advance through a state the rest of the app doesn't
 * agree it is in. Each call performs exactly one step and returns; the caller
 * loops. That keeps every request inside a normal action's lifetime (a full
 * run is minutes long), makes progress visible between steps, and means an
 * interrupted run simply resumes where it stopped.
 */

/** The furthest auto mode will ever go on its own, regardless of configuration. */
export const AUTO_MODE_FINAL_STAGE: PipelineStage = "Package";

/**
 * Actions auto mode is allowed to perform. Everything omitted is either a
 * human decision or past the point where a human must take over:
 * `approve_package` and beyond are the approval gate the brief requires
 * ("a review step where a human can approve... before publishing"), and
 * `resolve_no_usable_sources` means research found nothing to work from,
 * which no amount of retrying fixes.
 */
const AUTO_STEPPABLE: ReadonlySet<NextActionKey> = new Set<NextActionKey>([
  "add_sources",
  "review_sources",
  "generate_content_plan",
  "generate_articles",
  "resolve_article_generation_failure",
  "resolve_article_evaluation",
  "select_article",
  "generate_channels",
  "resolve_channel_issue",
  "create_package",
]);

/**
 * Whether auto mode may perform a given action itself. Exported so the
 * policy can be asserted exhaustively in tests: a new next-action key has to
 * be classified deliberately rather than inheriting whatever the default
 * happens to be, because the ones left out are the approval gate.
 */
export function autoModeCanPerform(key: NextActionKey): boolean {
  return AUTO_STEPPABLE.has(key);
}

/**
 * Which workspace tab a completed step landed on, so its notification can
 * link straight there. Keyed by the action performed, not the stage, since
 * two actions in the same stage can leave you in different places.
 */
const TAB_FOR_ACTION: Record<NextActionKey, WorkspaceTab> = {
  add_sources: "research",
  wait_for_research: "research",
  resolve_no_usable_sources: "research",
  review_sources: "research",
  generate_content_plan: "plan",
  generate_articles: "articles",
  resolve_article_generation_failure: "articles",
  resolve_article_evaluation: "articles",
  select_article: "articles",
  generate_channels: "channels",
  resolve_channel_issue: "channels",
  create_package: "package",
  approve_package: "package",
  queue_approved_content: "publishing",
  none: "overview",
};

export type AutoStepStatus = "advanced" | "finished" | "blocked";

export interface AutoStepResult {
  status: AutoStepStatus;
  /** The action this step performed, or the one it stopped in front of. */
  action: NextActionKey;
  stage: PipelineStage;
  message: string;
}

/**
 * Retries a generation step when the AI's output fails one of the
 * application's own checks — a plan whose factual section cites no evidence,
 * an article whose claims do not resolve. Those are non-deterministic: the
 * same prompt usually produces a valid result on another attempt, which is
 * precisely what a person would do by hand.
 *
 * Only VALIDATION_ERROR is retried. A permission, state, or truncation
 * failure means something is actually wrong, and repeating the call would
 * just spend money to fail identically.
 */
async function withValidationRetry<T>(attempts: number, run: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!(error instanceof DomainError) || error.code !== "VALIDATION_ERROR") throw error;
    }
  }
  throw lastError;
}

function meanScore(evaluation: EvaluationRow | null): number {
  const criteria = (evaluation?.criteria as Array<{ score?: number }> | null) ?? [];
  const scores = criteria.map((c) => c.score).filter((s): s is number => typeof s === "number");
  return scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Performs the request's next action if auto mode is allowed to, and reports
 * what happened. `stopAfter` names the last stage it may act in — a run
 * configured to stop after "Plan" will generate the plan and then finish
 * rather than going on to write articles.
 */
export async function runAutoStep(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  research: ResearchProvider,
  modelId: string,
  requestId: string,
  stopAfter: PipelineStage = AUTO_MODE_FINAL_STAGE
): Promise<AutoStepResult> {
  const workspace = await loadWorkspace(supabase, requestId);
  const { snapshot, request } = workspace;
  const nextAction = deriveNextAction(snapshot);
  const { stage } = derivePipelineProgress(snapshot);

  /**
   * Every outcome is reported to Discord, because this is the mode where
   * nobody is watching: a run takes minutes and does seven or eight things
   * in a row. Best-effort — a notification that fails must never undo a
   * step that succeeded.
   */
  const report = async (result: AutoStepResult): Promise<AutoStepResult> => {
    await bestEffort(() => {
      if (result.status === "finished") {
        return notifyAutoModeFinished({ requestId, topic: request.topic, detail: result.message });
      }
      return notifyAutoModeStep({
        requestId,
        topic: request.topic,
        stage: result.stage,
        detail: result.message,
        tab: TAB_FOR_ACTION[result.action] ?? "overview",
        blocked: result.status === "blocked",
      });
    });
    return result;
  };

  const finished = (message: string) => report({ status: "finished", action: nextAction.key, stage, message });
  const blocked = (message: string) => report({ status: "blocked", action: nextAction.key, stage, message });
  const advanced = (message: string) => report({ status: "advanced", action: nextAction.key, stage, message });

  if (!AUTO_STEPPABLE.has(nextAction.key)) {
    if (nextAction.key === "resolve_no_usable_sources") {
      return blocked("Research produced no usable sources. Add a source or retry a failed one before continuing.");
    }
    return finished(`Auto mode has gone as far as it can — ${nextAction.label} is yours to decide.`);
  }

  // A stage beyond the configured stop is where the run ends, not an error.
  const stopIndex = PIPELINE_STAGES.indexOf(stopAfter);
  if (PIPELINE_STAGES.indexOf(stage) > stopIndex) {
    return finished(`Stopped after ${stopAfter}, as configured. Next up; ${nextAction.label}.`);
  }

  switch (nextAction.key) {
    case "add_sources": {
      const result = await runResearchPipeline(supabase, ai, research, modelId, requestId);

      // Nothing usable leaves the request at draft, whose next action is
      // "start research" again — so without this, auto mode re-ran the
      // whole pipeline until its 40-step guard tripped, paying for every
      // one. There is nothing a repeat would find: the same scope, the
      // same searches, the same pages.
      if (result.usableSourceCount === 0) {
        return blocked(
          workspace.request.supplied_sources_only
            ? "Nothing in the supplied materials could be used for this topic. Add another source, or allow a web search as well, then continue."
            : "Research found nothing usable for this topic. Add a source yourself, then continue."
        );
      }

      return advanced(`Research complete — ${result.usableSourceCount} source(s) will inform the plan.`);
    }

    case "review_sources": {
      // Auto mode making the grounding judgement on the user's behalf.
      //
      // It follows the analyzer's per-source recommendation rather than
      // accepting whatever retrieved: a page can read perfectly, yield
      // evidence, and be about something else entirely — which is the case
      // source review exists to catch, and the one a blanket "accept all
      // usable" was guaranteed to miss. Supplied URLs and uploaded files
      // go through the same analyzer, so a link that turns out to be off
      // topic is excluded like any other.
      // Only sources nobody has ruled on. Auto mode used to record a
      // decision for every usable source, which silently replaced
      // decisions the user had already made by hand — the opposite of
      // picking up where they left off.
      const usable = workspace.sources.filter((s) => s.retrieval_status === "usable");
      const undecided = usable.filter((s) => !workspace.sourceDecisions[s.id]);
      const alreadyAccepted = usable.filter((s) => workspace.sourceDecisions[s.id] === "accepted");

      const accepted = undecided.filter((s) => s.recommendation !== "exclude");
      const excluded = undecided.filter((s) => s.recommendation === "exclude");

      for (const source of excluded) {
        await recordSourceDecision(supabase, {
          sourceId: source.id,
          decision: "excluded",
          reason: source.recommendation_reason ?? "Excluded automatically by auto mode.",
          decidedBy: request.owner_id,
        });
      }

      if (accepted.length + alreadyAccepted.length === 0) {
        return blocked(
          workspace.request.supplied_sources_only
            ? "None of the supplied materials are about this topic, so there is nothing to write from. " +
                "Add another source, or allow a web search as well, then continue."
            : "Every source found is about something else, so there is nothing to write from. " +
                "Add a source yourself, then continue."
        );
      }

      for (const source of accepted) {
        await recordSourceDecision(supabase, {
          sourceId: source.id,
          decision: "accepted",
          reason: source.recommendation_reason ?? "Accepted automatically by auto mode.",
          decidedBy: request.owner_id,
        });
      }

      await confirmSourceSet(supabase, requestId);

      const keptYours = alreadyAccepted.length > 0 ? ` (plus ${alreadyAccepted.length} you had already accepted)` : "";
      return advanced(
        excluded.length > 0
          ? `Accepted ${accepted.length} source(s)${keptYours}, excluded ${excluded.length} as off topic, and confirmed the source set.`
          : `Accepted ${accepted.length} source(s)${keptYours} and confirmed the source set.`
      );
    }

    case "generate_content_plan": {
      const plan = await withValidationRetry(3, () => generateContentPlan(supabase, ai, modelId, requestId));
      return advanced(`Content plan created with ${(plan.sections as unknown[] | null)?.length ?? 0} section(s).`);
    }

    case "generate_articles": {
      const results = await withValidationRetry(2, () => generateArticleOptions(supabase, ai, modelId, requestId));
      const ok = results.filter((r) => r.status === "succeeded").length;
      return advanced(`Generated ${ok} of ${results.length} article option(s).`);
    }

    case "resolve_article_generation_failure": {
      const failed = workspace.articleArtifacts.filter((a) => !a.current_version_id);
      for (const artifact of failed) {
        await regenerateArticleOption(supabase, ai, modelId, artifact.id);
      }
      return advanced(`Retried ${failed.length} failed article option(s).`);
    }

    case "resolve_article_evaluation": {
      // Evaluate anything unevaluated first — an option with no verdict is
      // not the same as one that failed, and revising it would be premature.
      const unevaluated = workspace.articleArtifacts.filter((a) => a.current_version_id && !workspace.articleEvaluations[a.id]);
      if (unevaluated.length > 0) {
        for (const artifact of unevaluated) {
          await evaluateArticleVersion(supabase, ai, modelId, artifact.current_version_id!);
        }
        return advanced(`Evaluated ${unevaluated.length} article option(s).`);
      }

      // Everything is evaluated and none passed: spend each option's one
      // permitted automatic revision (§18), which re-evaluates as it goes.
      const revisable: string[] = [];
      for (const artifact of workspace.articleArtifacts) {
        if (!artifact.current_version_id) continue;
        const versions = await listArtifactVersions(supabase, artifact.id);
        const automaticRevisions = versions.filter((v) => v.change_type === "automatic_revision").length;
        if (canAutoRevise(automaticRevisions, workspace.articleEvaluations[artifact.id]?.overall_status ?? null)) {
          revisable.push(artifact.current_version_id);
        }
      }

      if (revisable.length === 0) {
        return blocked(
          "No article option passed evaluation and each has already used its one automatic revision. " +
            "Revise a section by hand, or regenerate an option, then continue."
        );
      }

      for (const versionId of revisable) {
        await autoReviseArticle(supabase, ai, modelId, versionId);
      }
      return advanced(`Auto-revised and re-evaluated ${revisable.length} article option(s).`);
    }

    case "select_article": {
      // Best passing option by mean evaluator score, so the choice is made on
      // the evaluation's own numbers rather than slot order.
      const passing = workspace.articleArtifacts
        .filter((a) => a.current_version_id && workspace.articleEvaluations[a.id]?.overall_status === "pass")
        .sort((a, b) => meanScore(workspace.articleEvaluations[b.id]) - meanScore(workspace.articleEvaluations[a.id]));

      const best = passing[0];
      if (!best?.current_version_id) return blocked("No article option is eligible for selection.");

      await selectArticle(supabase, requestId, best.current_version_id, request.owner_id);
      return advanced(`Selected option ${best.slot} (highest evaluation score of ${passing.length} passing).`);
    }

    case "generate_channels": {
      const results = await withValidationRetry(2, () => generateChannelAssets(supabase, ai, modelId, requestId));
      const ok = results.filter((r) => r.status === "succeeded").length;
      return advanced(`Generated ${ok} of ${results.length} channel asset(s).`);
    }

    case "resolve_channel_issue": {
      const missing = workspace.channelArtifacts.filter((a) => !a.current_version_id);
      for (const artifact of missing) {
        await regenerateChannelAsset(supabase, ai, modelId, artifact.id);
      }

      const unevaluated = workspace.channelArtifacts.filter((a) => a.current_version_id && !workspace.channelEvaluations[a.id]);
      for (const artifact of unevaluated) {
        await evaluateChannelVersion(supabase, ai, modelId, artifact.current_version_id!);
      }

      if (missing.length > 0 || unevaluated.length > 0) {
        return advanced(`Regenerated ${missing.length} and evaluated ${unevaluated.length} channel asset(s).`);
      }

      // Everything is generated and evaluated, and something still fails:
      // regenerate those channels once, then let the next step re-evaluate.
      const failing = workspace.channelArtifacts.filter((a) => workspace.channelEvaluations[a.id]?.overall_status !== "pass");
      if (failing.length === 0) return blocked("Channels look complete but the request is not ready — check the readiness checklist.");

      for (const artifact of failing) {
        await regenerateChannelAsset(supabase, ai, modelId, artifact.id);
      }
      return advanced(`Regenerated ${failing.length} channel asset(s) that did not pass evaluation.`);
    }

    case "create_package": {
      const pkg = await createContentPackage(supabase, requestId);
      return advanced(`Package v${pkg.version_number} created — ready for you to review.`);
    }

    default:
      throw new DomainError("INVALID_STATE", "auto_mode", `Auto mode has no step for "${nextAction.key}".`);
  }
}
