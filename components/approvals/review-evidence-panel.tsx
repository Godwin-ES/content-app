import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EvaluationSummary } from "@/components/articles/evaluation-summary";
import { EvaluationDrawer } from "@/components/articles/evaluation-drawer";
import { LocalDateTime } from "@/components/shared/local-date-time";
import type { PackageReviewContext } from "@/lib/approvals/service";

interface ReviewEvidencePanelProps {
  context: PackageReviewContext;
}

const DECISION_LABEL: Record<string, string> = {
  pending: "Pending",
  withdrawn: "Withdrawn",
  approved: "Approved",
  changes_requested: "Changes requested",
};

/**
 * Secondary evidence panel (SYSTEM-DESIGN-NEXTJS.md §34.9): reviewed
 * sources, grounding/evaluation summary, and previous feedback — kept
 * secondary to the article/channel outputs themselves.
 */
export function ReviewEvidencePanel({ context }: ReviewEvidencePanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">Reviewed sources ({context.sources.length})</p>
        <ul className="flex flex-col gap-2">
          {context.sources.map((source) => (
            <li key={source.id} className="text-sm">
              {source.original_url ? (
                <a
                  href={source.original_url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="flex items-center gap-1.5 font-medium group-hover:underline">
                    {source.title ?? source.original_url}
                    <ExternalLink aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  </span>
                  <span className="block truncate text-xs text-muted-foreground group-hover:underline">{source.original_url}</span>
                </a>
              ) : (
                <>
                  <p className="font-medium">{source.title ?? "Untitled source"}</p>
                  <p className="text-xs text-muted-foreground">Uploaded material</p>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border p-4">
        <p className="mb-2 text-sm font-medium">Evaluations</p>
        <div className="flex flex-col gap-3">
          {(["article", "linkedin", "x", "newsletter"] as const).map((key) => {
            const evaluation = context.evaluations[key];
            return (
              <div key={key} className="flex flex-col gap-1">
                <p className="text-xs font-medium uppercase text-muted-foreground">{key}</p>
                <EvaluationSummary evaluation={evaluation} />
                {evaluation ? <EvaluationDrawer evaluation={evaluation} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      {context.previousReviews.length > 0 ? (
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-sm font-medium">Previous feedback</p>
          <ul className="flex flex-col gap-2">
            {context.previousReviews.map((review) => (
              <li key={review.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{DECISION_LABEL[review.status] ?? review.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    <LocalDateTime value={review.submitted_at} />
                  </span>
                </div>
                {review.comment ? <p className="mt-1 text-muted-foreground">&ldquo;{review.comment}&rdquo;</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
