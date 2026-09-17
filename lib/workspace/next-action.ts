export type NextActionKey =
  | "add_sources"
  | "wait_for_research"
  | "resolve_no_usable_sources"
  | "review_sources"
  | "generate_content_plan"
  | "generate_articles"
  | "resolve_article_generation_failure"
  | "resolve_article_evaluation"
  | "select_article"
  | "generate_channels"
  | "resolve_channel_issue"
  | "create_package"
  | "submit_for_approval"
  | "await_review"
  | "review_requested_changes"
  | "queue_approved_content"
  | "none";

export interface NextAction {
  key: NextActionKey;
  label: string;
  description: string;
}

export interface WorkspaceSnapshot {
  status: string;
  sources: { usable: number; pending: number; failed: number; unusable: number };
  hasContentPlan: boolean;
  articles: { total: number; anyGenerationFailed: boolean; anyPassingEvaluation: boolean; anyNeedsRevisionOrUnevaluated: boolean };
  hasSelectedArticle: boolean;
  channels: { total: number; anyMissing: boolean; anyNotPassing: boolean };
  packageReady: boolean;
  hasCurrentPackage: boolean;
  hasActiveQueueItems: boolean;
}

function action(key: NextActionKey, label: string, description: string): NextAction {
  return { key, label, description };
}

/**
 * Derives exactly one primary next action from the request's current state
 * (SYSTEM-DESIGN-NEXTJS.md §34, Task 19 Step 1) so the workspace can tell
 * the Content Manager what to do next without them having to understand
 * the underlying database status machine.
 */
export function deriveNextAction(snapshot: WorkspaceSnapshot): NextAction {
  switch (snapshot.status) {
    case "draft":
      return action(
        "add_sources",
        "Research: Start content research",
        "Start research on this topic using any supplied URLs/materials, plus a general web search."
      );

    case "source_review": {
      if (snapshot.sources.pending > 0) {
        return action("wait_for_research", "Research: In progress", "Retrieval and analysis are still running.");
      }
      if (snapshot.sources.usable === 0) {
        return action(
          "resolve_no_usable_sources",
          "Research: Resolve source retrieval",
          "No usable sources yet — retry a failed source or add another."
        );
      }
      return action("review_sources", "Research: Review sources", "Decide which retrieved sources to include before planning content.");
    }

    case "content_development": {
      if (!snapshot.hasContentPlan) {
        return action("generate_content_plan", "Plan: Generate content plan", "Create an evidence-backed outline before writing articles.");
      }
      if (snapshot.articles.total === 0) {
        return action("generate_articles", "Articles: Generate articles", "Generate three article options from the content plan.");
      }
      if (snapshot.articles.anyGenerationFailed) {
        return action("resolve_article_generation_failure", "Articles: Retry failed option", "One or more article options failed to generate.");
      }
      if (!snapshot.hasSelectedArticle) {
        if (snapshot.articles.anyPassingEvaluation) {
          return action("select_article", "Articles: Select an article", "Choose which evaluated article option to move forward with.");
        }
        return action("resolve_article_evaluation", "Articles: Resolve evaluation", "Evaluate or revise an article option before selecting one.");
      }
      if (snapshot.channels.total === 0 || snapshot.channels.anyMissing) {
        return action("generate_channels", "Channels: Generate channel assets", "Adapt the selected article for LinkedIn, X, and the newsletter.");
      }
      if (snapshot.channels.anyNotPassing) {
        return action("resolve_channel_issue", "Channels: Resolve evaluation", "One or more channel assets need evaluation or revision.");
      }
      if (!snapshot.hasCurrentPackage) {
        if (snapshot.packageReady) {
          return action("create_package", "Approval: Create package", "Everything is ready — create the package for approval.");
        }
        return action("resolve_channel_issue", "Channels: Resolve remaining readiness issues", "Check the package readiness checklist for what remains.");
      }
      return action("submit_for_approval", "Approval: Submit for approval", "Send the current package to the Reviewer.");
    }

    case "pending_approval":
      return action("await_review", "Approval: Awaiting review", "The package is read-only while the Reviewer decides.");

    case "changes_requested":
      return action("review_requested_changes", "Approval: Review requested changes", "The Reviewer asked for changes before resubmission.");

    case "approved":
      if (!snapshot.hasActiveQueueItems) {
        return action("queue_approved_content", "Publishing: Queue approved content", "Queue or schedule the approved package's channels.");
      }
      return action("none", "Nothing pending", "This request has no outstanding action right now.");

    default:
      return action("none", "Nothing pending", "This request has no outstanding action right now.");
  }
}

/**
 * The six stages of the pipeline, in order — the same six the request
 * workspace has tabs for. Every next action belongs to exactly one of
 * them, and each action's label is already prefixed with its stage name
 * ("Articles: Select an article"), so this mapping is what that prefix
 * has been saying all along, made explicit and reusable.
 */
export const PIPELINE_STAGES = ["Research", "Plan", "Articles", "Channels", "Approval", "Publishing"] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * Stages auto mode can be told to stop after. Publishing is absent by
 * design: the package is the furthest anything automatic goes, and what
 * happens past it is a person's decision.
 */
export const AUTO_MODE_STAGES = PIPELINE_STAGES.filter((stage) => stage !== "Publishing");

const STAGE_FOR_ACTION: Record<NextActionKey, PipelineStage> = {
  add_sources: "Research",
  wait_for_research: "Research",
  resolve_no_usable_sources: "Research",
  review_sources: "Research",
  generate_content_plan: "Plan",
  generate_articles: "Articles",
  resolve_article_generation_failure: "Articles",
  resolve_article_evaluation: "Articles",
  select_article: "Articles",
  generate_channels: "Channels",
  resolve_channel_issue: "Channels",
  create_package: "Approval",
  submit_for_approval: "Approval",
  await_review: "Approval",
  review_requested_changes: "Approval",
  queue_approved_content: "Publishing",
  // Nothing outstanding only ever happens at the end of the line.
  none: "Publishing",
};

export interface PipelineProgress {
  stage: PipelineStage;
  /** 1-based position of `stage` within PIPELINE_STAGES. */
  step: number;
  totalSteps: number;
  /** The next action's own description, so a caller can show what the step actually asks for. */
  label: string;
}

/**
 * How far along the pipeline a request is, derived from the very same
 * next action the workspace Overview shows — so a request's stage cannot
 * say one thing on the dashboard and another on its own page.
 */
export function derivePipelineProgress(snapshot: WorkspaceSnapshot): PipelineProgress {
  const nextAction = deriveNextAction(snapshot);
  const stage = STAGE_FOR_ACTION[nextAction.key];
  return {
    stage,
    step: PIPELINE_STAGES.indexOf(stage) + 1,
    totalSteps: PIPELINE_STAGES.length,
    label: nextAction.label,
  };
}
