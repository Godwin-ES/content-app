import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError, getErrorMessage } from "@/lib/domain/errors";
import { assertContentEditable } from "@/lib/domain/request-guards";
import { hashCanonicalJson } from "@/lib/domain/hashing";
import type { AIProvider } from "@/lib/ai/types";
import { evaluateArticle as evaluateArticleAI, reviseArticle as reviseArticleAI } from "@/lib/ai/service";
import { composeArticle } from "@/lib/articles/compose";
import { withOperationRun } from "@/lib/operations/track";
import type { ArticleAngle } from "@/lib/ai/prompts/article-writer";
import type { ContentPlan, ContentPlanSection } from "@/lib/ai/schemas/content-plan";
import { articleBodyMarkdown, type ArticleOutput } from "@/lib/ai/schemas/article";
import type { Evaluation } from "@/lib/ai/schemas/evaluation";
import { getEvidenceContextForRequest } from "@/lib/grounding/evidence-context";
import { validateClaimEvidence } from "@/lib/grounding/claim-validation";
import { validateEvaluationConsistency } from "@/lib/grounding/semantic-validation";
import { validateArticleSEO } from "@/lib/seo/validate";
import {
  getContentArtifactBySlot,
  createContentArtifact,
  createArtifactVersion,
  getArtifactVersion,
  countAutomaticRevisions,
} from "@/lib/repositories/content";
import { createOperationRun, updateOperationRun, findActiveOperationRun } from "@/lib/repositories/operations";
import { recordActivityEvent } from "@/lib/repositories/activity";
import { createEvaluation, getLatestEvaluation } from "@/lib/repositories/evaluations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];
type ContentPlanRow = Database["public"]["Tables"]["content_plans"]["Row"];
type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];
type ArticleSlot = "A" | "B" | "C";

/**
 * Pure business rule for the one-automatic-revision limit
 * (SYSTEM-DESIGN-NEXTJS.md §18): code enforces this, not the model.
 * Automatic revision only ever applies right after a `revise` result, and
 * only once per article option regardless of how the new version scores.
 */
export function canAutoRevise(automaticRevisionCount: number, latestEvaluationStatus: string | null): boolean {
  return automaticRevisionCount < 1 && latestEvaluationStatus === "revise";
}

function evaluationRowToEvaluation(row: EvaluationRow): Evaluation {
  return {
    overallStatus: row.overall_status as Evaluation["overallStatus"],
    criteria: (row.criteria as unknown as Evaluation["criteria"]) ?? [],
    claimAudit: (row.claim_audit as unknown as Evaluation["claimAudit"]) ?? [],
    unsupportedClaims: (row.unsupported_claims as string[] | null) ?? [],
    sectionsNeedingRevision: (row.sections_needing_revision as string[] | null) ?? [],
    revisionInstructions: row.revision_instructions,
  };
}

const ANGLE_BY_SLOT: Record<ArticleSlot, ArticleAngle> = {
  A: "practical",
  B: "strategic",
  C: "educational",
};

export interface ArticleOptionResult {
  slot: ArticleSlot;
  status: "succeeded" | "failed" | "already_running";
  versionId?: string;
  error?: string;
}

async function getRequestOrThrow(supabase: SupabaseClient<Database>, requestId: string): Promise<ContentRequestRow> {
  const { data, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !data) throw error ?? new DomainError("NOT_FOUND", "article_generation", "Request not found.");
  return data;
}

function planRowToContentPlan(row: ContentPlanRow): ContentPlan {
  return {
    insufficientEvidence: false,
    insufficientEvidenceReason: null,
    primaryKeyword: row.primary_keyword,
    secondaryKeywords: ((row.secondary_keywords as string[] | null) ?? []),
    searchIntent: row.search_intent ?? "",
    angle: row.angle ?? "",
    title: row.title,
    sections: (row.sections as unknown as ContentPlanSection[]) ?? [],
    ctaDirection: row.cta_direction,
    links: (row.links as string[] | null) ?? [],
    knownLimitations: row.known_limitations,
  };
}

/**
 * Generates (or regenerates) one article option end to end: acquire the
 * artifact, guard against a duplicate concurrent run for the same option,
 * call the writer, validate its claims against the current evidence, and
 * persist through the immutable-version RPC. Never throws for an
 * individual option's failure — the caller collects per-slot results so
 * one failure cannot erase the others (SYSTEM-DESIGN-NEXTJS.md §26.2).
 */
async function generateOneOption(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  request: ContentRequestRow,
  plan: ContentPlan,
  planId: string,
  evidencePackets: Awaited<ReturnType<typeof getEvidenceContextForRequest>>["packets"],
  validEvidenceIds: Set<string>,
  slot: ArticleSlot
): Promise<ArticleOptionResult> {
  let artifact = await getContentArtifactBySlot(supabase, request.id, "article", slot);
  if (!artifact) {
    try {
      artifact = await createContentArtifact(supabase, { requestId: request.id, kind: "article", slot });
    } catch (error) {
      // Two concurrent calls (e.g. a duplicate button click) can both find
      // no existing artifact and race to create it; the unique index on
      // (request_id, slot) rejects the second insert. Re-fetch instead of
      // failing — the other call's row is the authoritative one.
      artifact = await getContentArtifactBySlot(supabase, request.id, "article", slot);
      if (!artifact) throw error;
    }
  }

  const idempotencyKey = `article_generation:${artifact.id}`;
  const activeRun = await findActiveOperationRun(supabase, request.id, idempotencyKey);
  if (activeRun) {
    return { slot, status: "already_running" };
  }

  let run;
  try {
    run = await createOperationRun(supabase, {
      request_id: request.id,
      operation_type: "article_generation",
      status: "running",
      model: modelId,
      idempotency_key: idempotencyKey,
      base_artifact_version_id: artifact.current_version_id,
      started_at: new Date().toISOString(),
    });
  } catch {
    // Unique-constraint race on the idempotency key: another request is
    // already handling this exact option.
    return { slot, status: "already_running" };
  }

  try {
    const output = await composeArticle(ai, modelId, {
      angle: ANGLE_BY_SLOT[slot],
      audience: request.resolved_audience,
      objective: request.resolved_objective,
      tone: request.resolved_tone,
      cta: request.resolved_cta,
      plan,
      evidencePackets,
    });

    validateClaimEvidence(output.claims, validEvidenceIds);

    const contentHash = hashCanonicalJson(JSON.parse(JSON.stringify(output)));
    const version = await createArtifactVersion(supabase, {
      artifactId: artifact.id,
      expectedCurrentVersionId: artifact.current_version_id,
      changeType: "initial_generation",
      content: output,
      contentHash,
      sourceSetVersionId: request.current_source_set_id!,
      contentPlanId: planId,
      baseArticleVersionId: null,
    });

    await updateOperationRun(supabase, run.id, { status: "succeeded", finished_at: new Date().toISOString() });

    // Best-effort: evaluation runs immediately after a successful generation
    // (SYSTEM-DESIGN-NEXTJS.md §47 blueprint), but its failure must not
    // erase the article that was just successfully created. The Content
    // Manager can still trigger evaluation manually if this fails.
    try {
      await evaluateArticleVersion(supabase, ai, modelId, version.id);
    } catch {
      // Swallowed intentionally; the article option itself still succeeded.
    }

    return { slot, status: "succeeded", versionId: version.id };
  } catch (error) {
    await updateOperationRun(supabase, run.id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: getErrorMessage(error),
    });
    return { slot, status: "failed", error: getErrorMessage(error) };
  }
}

/**
 * Generates all three article options from the same request, confirmed
 * source set, and content plan (SYSTEM-DESIGN-NEXTJS.md §15). Options run
 * concurrently; one option's failure never blocks or erases the others.
 */
export async function generateArticleOptions(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  requestId: string
): Promise<ArticleOptionResult[]> {
  const request = await getRequestOrThrow(supabase, requestId);
  assertContentEditable(request);
  if (!request.current_plan_id || !request.current_source_set_id) {
    throw new DomainError("INVALID_STATE", "article_generation", "This request has no confirmed content plan yet.");
  }

  const { data: planRow, error: planError } = await supabase
    .from("content_plans")
    .select()
    .eq("id", request.current_plan_id)
    .single();
  if (planError || !planRow) throw planError ?? new DomainError("NOT_FOUND", "article_generation", "Content plan not found.");

  const plan = planRowToContentPlan(planRow);
  const { packets: evidencePackets, validEvidenceIds } = await getEvidenceContextForRequest(supabase, request);

  /**
   * Three options, one per angle — practical, strategic, educational.
   *
   * Dropped to one when an article took seventy seconds to write and three
   * of them meant waiting for the slowest. Writing a section at a time
   * removed that reason: the three run concurrently and each is now a
   * fraction of what one used to cost, so the choice is cheap again, and a
   * choice between three angles is the point of the step.
   */
  const slots: ArticleSlot[] = ["A", "B", "C"];
  const results = await Promise.all(
    slots.map((slot) =>
      generateOneOption(supabase, ai, modelId, request, plan, planRow.id, evidencePackets, validEvidenceIds, slot)
    )
  );

  const succeeded = results.filter((r) => r.status === "succeeded").length;
  await recordActivityEvent({
    requestId,
    eventType: "article_options_generated",
    message: `${succeeded} of ${slots.length} article option(s) generated`,
    actorId: request.owner_id,
  });

  return results;
}

/**
 * Regenerates a single, previously failed article option in place
 * (SYSTEM-DESIGN-NEXTJS.md §12 partial-success recovery).
 */
export async function regenerateArticleOption(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  artifactId: string
): Promise<ArticleOptionResult> {
  const { data: artifact, error: artifactError } = await supabase
    .from("content_artifacts")
    .select()
    .eq("id", artifactId)
    .single();
  if (artifactError || !artifact) throw artifactError ?? new DomainError("NOT_FOUND", "article_generation", "Artifact not found.");
  if (artifact.kind !== "article" || !artifact.slot) {
    throw new DomainError("VALIDATION_ERROR", "article_generation", "Only an article option can be regenerated this way.");
  }

  const request = await getRequestOrThrow(supabase, artifact.request_id);
  assertContentEditable(request);
  if (!request.current_plan_id) {
    throw new DomainError("INVALID_STATE", "article_generation", "This request has no confirmed content plan.");
  }

  const { data: planRow, error: planError } = await supabase
    .from("content_plans")
    .select()
    .eq("id", request.current_plan_id)
    .single();
  if (planError || !planRow) throw planError ?? new DomainError("NOT_FOUND", "article_generation", "Content plan not found.");

  const plan = planRowToContentPlan(planRow);
  const { packets: evidencePackets, validEvidenceIds } = await getEvidenceContextForRequest(supabase, request);

  return generateOneOption(
    supabase,
    ai,
    modelId,
    request,
    plan,
    planRow.id,
    evidencePackets,
    validEvidenceIds,
    artifact.slot as ArticleSlot
  );
}

/**
 * Evaluates one article version (SYSTEM-DESIGN-NEXTJS.md §17). The writer
 * and evaluator are separate AI calls; the evaluator never receives the
 * writer's internal justification, only the public article, its claim
 * ledger, and the same approved evidence. Deterministic SEO checks run
 * first and always accompany the evaluation regardless of what the AI
 * says. A single controlled retry covers an internally inconsistent
 * evaluator output (e.g. `pass` alongside an unsupported claim); if the
 * retry is also inconsistent, the evaluation fails and the article is
 * left untouched — no evaluation row is created either way.
 */
export async function evaluateArticleVersion(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  articleVersionId: string
): Promise<EvaluationRow> {
  const version = await getArtifactVersion(supabase, articleVersionId);
  if (!version) throw new DomainError("NOT_FOUND", "article_evaluation", "Article version not found.");

  const { data: artifact, error: artifactError } = await supabase
    .from("content_artifacts")
    .select()
    .eq("id", version.artifact_id)
    .single();
  if (artifactError || !artifact) throw artifactError ?? new DomainError("NOT_FOUND", "article_evaluation", "Artifact not found.");

  const request = await getRequestOrThrow(supabase, artifact.request_id);
  const { packets: evidencePackets } = await getEvidenceContextForRequest(supabase, request);

  const article = version.content as unknown as ArticleOutput;
  const deterministicChecks = validateArticleSEO({
    title: article.title,
    primaryKeyword: article.primaryKeyword,
    bodyMarkdown: articleBodyMarkdown(article),
    links: article.links,
  });
  const articleClaimIds = new Set(article.claims.map((c) => c.claimId));

  const run = await createOperationRun(supabase, {
    request_id: request.id,
    operation_type: "article_evaluation",
    status: "running",
    model: modelId,
    base_artifact_version_id: version.id,
    started_at: new Date().toISOString(),
  });

  async function attempt(): Promise<Evaluation> {
    const evaluation = await evaluateArticleAI(ai, modelId, {
      audience: request.resolved_audience,
      objective: request.resolved_objective,
      tone: request.resolved_tone,
      article,
      evidencePackets,
    });
    validateEvaluationConsistency(evaluation, articleClaimIds);
    return evaluation;
  }

  let evaluation: Evaluation;
  try {
    evaluation = await attempt();
  } catch {
    try {
      evaluation = await attempt();
    } catch (secondError) {
      await updateOperationRun(supabase, run.id, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: getErrorMessage(secondError),
      });
      throw new DomainError(
        "VALIDATION_ERROR",
        "article_evaluation",
        `Evaluation failed after one retry: ${getErrorMessage(secondError)}`
      );
    }
  }

  await updateOperationRun(supabase, run.id, { status: "succeeded", finished_at: new Date().toISOString() });

  return createEvaluation(supabase, {
    artifact_version_id: version.id,
    overall_status: evaluation.overallStatus,
    deterministicChecks: deterministicChecks,
    criteria: evaluation.criteria,
    claimAudit: evaluation.claimAudit,
    unsupportedClaims: evaluation.unsupportedClaims,
    sectionsNeedingRevision: evaluation.sectionsNeedingRevision,
    revision_instructions: evaluation.revisionInstructions,
    operation_run_id: run.id,
    created_by: request.owner_id,
  });
}

async function loadArticleContext(supabase: SupabaseClient<Database>, articleVersionId: string) {
  const version = await getArtifactVersion(supabase, articleVersionId);
  if (!version) throw new DomainError("NOT_FOUND", "article_revision", "Article version not found.");

  const { data: artifact, error: artifactError } = await supabase
    .from("content_artifacts")
    .select()
    .eq("id", version.artifact_id)
    .single();
  if (artifactError || !artifact) throw artifactError ?? new DomainError("NOT_FOUND", "article_revision", "Artifact not found.");

  const request = await getRequestOrThrow(supabase, artifact.request_id);
  const { packets: evidencePackets, validEvidenceIds } = await getEvidenceContextForRequest(supabase, request);

  return { version, artifact, request, evidencePackets, validEvidenceIds };
}

/**
 * Applies the one allowed automatic revision (SYSTEM-DESIGN-NEXTJS.md §18).
 * Code checks the limit before calling AI at all; the reviser receives the
 * current article, its evaluation findings, and the same approved evidence,
 * and must not introduce a new unsupported fact. The new version is
 * automatically evaluated too, so its result never inherits the prior
 * version's (now historical) evaluation.
 */
export async function autoReviseArticle(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  articleVersionId: string
): Promise<{ versionId: string; evaluationId: string }> {
  const { version, artifact, request, evidencePackets, validEvidenceIds } = await loadArticleContext(supabase, articleVersionId);
  assertContentEditable(request);

  const automaticRevisionCount = await countAutomaticRevisions(supabase, artifact.id);
  const latestEvaluation = await getLatestEvaluation(supabase, articleVersionId);

  if (!canAutoRevise(automaticRevisionCount, latestEvaluation?.overall_status ?? null)) {
    throw new DomainError(
      "INVALID_STATE",
      "article_revision",
      automaticRevisionCount >= 1
        ? "This article option already used its one automatic revision."
        : "Automatic revision only applies after an evaluation result of 'revise'."
    );
  }

  const article = version.content as unknown as ArticleOutput;
  const revised = await withOperationRun(
    supabase,
    { requestId: request.id, operationType: "article_revision", modelId },
    () =>
      reviseArticleAI(ai, modelId, {
        article,
        evaluation: evaluationRowToEvaluation(latestEvaluation!),
        evidencePackets,
      })
  );
  validateClaimEvidence(revised.claims, validEvidenceIds);

  const contentHash = hashCanonicalJson(JSON.parse(JSON.stringify(revised)));
  const newVersion = await createArtifactVersion(supabase, {
    artifactId: artifact.id,
    expectedCurrentVersionId: artifact.current_version_id,
    changeType: "automatic_revision",
    content: revised,
    contentHash,
    sourceSetVersionId: version.source_set_version_id,
    contentPlanId: version.content_plan_id,
    baseArticleVersionId: version.id,
  });

  const newEvaluation = await evaluateArticleVersion(supabase, ai, modelId, newVersion.id);

  await recordActivityEvent({
    requestId: request.id,
    eventType: "article_revised",
    message: `Option ${artifact.slot} revised and ${newEvaluation.overall_status === "pass" ? "passed" : newEvaluation.overall_status}`,
    actorId: request.owner_id,
  });

  return { versionId: newVersion.id, evaluationId: newEvaluation.id };
}

/**
 * Manual edit creates a new immutable version through the same optimistic-
 * concurrency RPC as every other version (SYSTEM-DESIGN-NEXTJS.md §19).
 * Allowed at any point, including after the automatic revision has been
 * used — the one-revision limit only bounds *automatic* revisions.
 */
export async function saveManualArticleRevision(
  supabase: SupabaseClient<Database>,
  artifactId: string,
  updatedContent: ArticleOutput,
  actorId: string
): Promise<ArtifactVersionRow> {
  const { data: artifact, error } = await supabase.from("content_artifacts").select().eq("id", artifactId).single();
  if (error || !artifact) throw error ?? new DomainError("NOT_FOUND", "article_revision", "Artifact not found.");

  const request = await getRequestOrThrow(supabase, artifact.request_id);
  assertContentEditable(request);
  const { validEvidenceIds } = await getEvidenceContextForRequest(supabase, request);
  validateClaimEvidence(updatedContent.claims, validEvidenceIds);

  const contentHash = hashCanonicalJson(JSON.parse(JSON.stringify(updatedContent)));
  const version = await createArtifactVersion(supabase, {
    artifactId: artifact.id,
    expectedCurrentVersionId: artifact.current_version_id,
    changeType: "manual_edit",
    content: updatedContent,
    contentHash,
    sourceSetVersionId: request.current_source_set_id!,
  });

  await recordActivityEvent({
    requestId: request.id,
    eventType: "article_manually_edited",
    message: `Option ${artifact.slot} manually edited`,
    actorId,
  });

  return version;
}

/**
 * Generates a proposed revision for one section without persisting it
 * (SYSTEM-DESIGN-NEXTJS.md §19: "A proposed AI revision should be
 * reviewable before application when practical"). Reuses the reviser
 * prompt/schema with a synthetic single-section evaluation rather than a
 * separate targeted-revision AI operation.
 */
export async function proposeTargetedRevision(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  articleVersionId: string,
  targetSection: string,
  instruction: string
): Promise<ArticleOutput> {
  const { version, request, evidencePackets } = await loadArticleContext(supabase, articleVersionId);
  const article = version.content as unknown as ArticleOutput;

  const syntheticEvaluation: Evaluation = {
    overallStatus: "revise",
    criteria: [],
    claimAudit: [],
    unsupportedClaims: [],
    sectionsNeedingRevision: [targetSection],
    revisionInstructions: instruction,
  };

  return withOperationRun(
    supabase,
    { requestId: request.id, operationType: "article_revision", modelId },
    () => reviseArticleAI(ai, modelId, { article, evaluation: syntheticEvaluation, evidencePackets })
  );
}

/**
 * Persists a targeted revision only once the Content Manager explicitly
 * applies it (SYSTEM-DESIGN-NEXTJS.md §19) — proposing never mutates
 * anything by itself.
 */
export async function applyTargetedRevision(
  supabase: SupabaseClient<Database>,
  articleVersionId: string,
  proposedContent: ArticleOutput,
  actorId: string
): Promise<ArtifactVersionRow> {
  const { version, artifact, request, validEvidenceIds } = await loadArticleContext(supabase, articleVersionId);
  assertContentEditable(request);
  validateClaimEvidence(proposedContent.claims, validEvidenceIds);

  const contentHash = hashCanonicalJson(JSON.parse(JSON.stringify(proposedContent)));
  const newVersion = await createArtifactVersion(supabase, {
    artifactId: artifact.id,
    expectedCurrentVersionId: artifact.current_version_id,
    changeType: "targeted_regeneration",
    content: proposedContent,
    contentHash,
    sourceSetVersionId: version.source_set_version_id,
    contentPlanId: version.content_plan_id,
    baseArticleVersionId: version.id,
  });

  await recordActivityEvent({
    requestId: request.id,
    eventType: "article_targeted_revision_applied",
    message: `Option ${artifact.slot} targeted revision applied`,
    actorId,
  });

  return newVersion;
}

/**
 * Records the Content Manager's explicit article selection
 * (SYSTEM-DESIGN-NEXTJS.md §20). Only a current revision with a passing
 * evaluation may be selected; the application never auto-selects based on
 * score.
 */
export async function selectArticle(
  supabase: SupabaseClient<Database>,
  requestId: string,
  articleVersionId: string,
  actorId: string
): Promise<void> {
  const version = await getArtifactVersion(supabase, articleVersionId);
  if (!version) throw new DomainError("NOT_FOUND", "article_selection", "Article version not found.");

  const { data: artifact, error } = await supabase.from("content_artifacts").select().eq("id", version.artifact_id).single();
  if (error || !artifact) throw error ?? new DomainError("NOT_FOUND", "article_selection", "Artifact not found.");
  if (artifact.request_id !== requestId || artifact.kind !== "article") {
    throw new DomainError("VALIDATION_ERROR", "article_selection", "This version does not belong to an article option on this request.");
  }
  if (artifact.current_version_id !== articleVersionId) {
    throw new DomainError("STALE_VERSION", "article_selection", "Only the current revision of an article option can be selected.");
  }

  const evaluation = await getLatestEvaluation(supabase, articleVersionId);
  if (!evaluation || evaluation.overall_status !== "pass") {
    throw new DomainError(
      "APPROVAL_REQUIRED",
      "article_selection",
      "Only an article option with a passing evaluation can be selected."
    );
  }

  const admin = createSupabaseAdminClient();
  await admin.from("content_requests").update({ selected_article_version_id: articleVersionId }).eq("id", requestId);

  await recordActivityEvent({
    requestId,
    eventType: "article_selected",
    message: `Option ${artifact.slot} selected`,
    actorId,
  });
}
