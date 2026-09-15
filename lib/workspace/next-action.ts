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
  | "reopen_rejected"
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
      return action("add_sources", "Add source material", "Provide source URLs or supporting material to begin research.");

    case "source_review": {
      if (snapshot.sources.pending > 0) {
        return action("wait_for_research", "Research in progress", "Retrieval and analysis are still running.");
      }
      if (snapshot.sources.usable === 0) {
        return action(
          "resolve_no_usable_sources",
          "Resolve source retrieval",
          "No usable sources yet — retry failed sources or add more."
        );
      }
      return action("review_sources", "Review sources", "Decide which retrieved sources to include before planning content.");
    }

    case "content_development": {
      if (!snapshot.hasContentPlan) {
        return action("generate_content_plan", "Generate content plan", "Create an evidence-backed outline before writing articles.");
      }
      if (snapshot.articles.total === 0) {
        return action("generate_articles", "Generate articles", "Generate three article options from the content plan.");
      }
      if (snapshot.articles.anyGenerationFailed) {
        return action("resolve_article_generation_failure", "Retry failed article option", "One or more article options failed to generate.");
      }
      if (!snapshot.hasSelectedArticle) {
        if (snapshot.articles.anyPassingEvaluation) {
          return action("select_article", "Select an article", "Choose which evaluated article option to move forward with.");
        }
        return action("resolve_article_evaluation", "Resolve evaluation", "Evaluate or revise an article option before selecting one.");
      }
      if (snapshot.channels.total === 0 || snapshot.channels.anyMissing) {
        return action("generate_channels", "Generate channel assets", "Adapt the selected article for LinkedIn, X, and the newsletter.");
      }
      if (snapshot.channels.anyNotPassing) {
        return action("resolve_channel_issue", "Resolve channel evaluation", "One or more channel assets need evaluation or revision.");
      }
      if (!snapshot.hasCurrentPackage) {
        if (snapshot.packageReady) {
          return action("create_package", "Create package", "Everything is ready — create the package for approval.");
        }
        return action("resolve_channel_issue", "Resolve remaining readiness issues", "Check the package readiness checklist for what remains.");
      }
      return action("submit_for_approval", "Submit for approval", "Send the current package to the Reviewer.");
    }

    case "pending_approval":
      return action("await_review", "Awaiting review", "The package is read-only while the Reviewer decides.");

    case "changes_requested":
      return action("review_requested_changes", "Review requested changes", "The Reviewer asked for changes before resubmission.");

    case "approved":
      if (!snapshot.hasActiveQueueItems) {
        return action("queue_approved_content", "Queue approved content", "Queue or schedule the approved package's channels.");
      }
      return action("none", "Nothing pending", "This request has no outstanding action right now.");

    case "rejected":
      return action("reopen_rejected", "Reopen for content development", "Explicitly reopen this request to make further changes.");

    default:
      return action("none", "Nothing pending", "This request has no outstanding action right now.");
  }
}
