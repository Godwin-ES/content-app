export type UserRole = "content_manager" | "reviewer";

export type ContentRequestStatus =
  | "draft"
  | "source_review"
  | "content_development"
  | "pending_approval"
  | "changes_requested"
  | "approved"
  | "archived";

export type OperationStatus = "queued" | "running" | "succeeded" | "failed" | "stale" | "cancelled";

export type AIProviderName = "anthropic" | "google" | "fake";

export type AIModelChoice = "gemini" | "claude_haiku_4_5" | "claude_sonnet_5";

export type SourceOrigin = "researched" | "user_url" | "uploaded_material";

export type MaterialClassification = "public" | "internal";

export type MaterialExtractionStatus = "pending" | "ready" | "failed";

export type ArticleSlot = "A" | "B" | "C";

export type ArtifactKind = "article" | "linkedin" | "x" | "newsletter";

export type ArtifactChangeType =
  | "initial_generation"
  | "automatic_revision"
  | "manual_edit"
  | "targeted_regeneration"
  | "channel_adaptation";

export type EvaluationStatus = "pass" | "revise" | "reject";

export type ApprovalReviewStatus = "pending" | "withdrawn" | "approved" | "changes_requested";

/**
 * What a Reviewer can decide on a pending package. Approve ships it;
 * Request Changes sends it back for edits and resubmission. There is
 * deliberately no third "reject" outcome — it differed from Request
 * Changes only by blocking resubmission until an explicit reopen, a
 * distinction the product never surfaced anywhere the Reviewer or the
 * Content Manager could see.
 */
export type ReviewDecision = Extract<ApprovalReviewStatus, "approved" | "changes_requested">;

export type PublishingChannel = "linkedin" | "x" | "newsletter";

export type PublishingQueueStatus = "queued" | "scheduled" | "cancelled";

/**
 * A resolved settings field distinguishes a value the user explicitly
 * supplied from one filled in by a visible brand default (SYSTEM-DESIGN-NEXTJS.md #7.3).
 */
export interface ResolvedField<T> {
  value: T;
  source: "supplied" | "default";
}

export interface ContentRequestInput {
  topic: string;
  audience?: string;
  objective?: string;
  tone?: string;
  cta?: string;
  primaryKeyword?: string;
  sourceUrls?: string[];
  additionalInstructions?: string;
  publicationDate?: string;
  /** Skip AI-generated web search entirely; research only the supplied sources. */
  suppliedSourcesOnly?: boolean;
}

export interface ResolvedRequestSettings {
  audience: ResolvedField<string>;
  objective: ResolvedField<string>;
  tone: ResolvedField<string>;
  cta: ResolvedField<string | null>;
  primaryKeyword: ResolvedField<string | null>;
}
