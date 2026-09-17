import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type RequestStatus = Database["public"]["Tables"]["content_requests"]["Row"]["status"];

/**
 * Where a request has got to along the pipeline, as a step count plus a
 * plain description of the stage. A status badge alone says what state a
 * request is in but not how far through it is, which is the thing you
 * actually want when scanning a list of work in progress.
 */
const STAGES: Record<RequestStatus, { step: number; label: string } | null> = {
  draft: { step: 1, label: "Setting up the request" },
  source_review: { step: 2, label: "Reviewing sources" },
  content_development: { step: 3, label: "Drafting content" },
  changes_requested: { step: 3, label: "Reworking after review" },
  pending_approval: { step: 4, label: "Awaiting reviewer" },
  approved: { step: 5, label: "Approved" },
  archived: null,
};

const TOTAL_STEPS = 5;

export function RequestStage({ status, className }: { status: RequestStatus; className?: string }) {
  const stage = STAGES[status];
  if (!stage) return null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">
        Step {stage.step} of {TOTAL_STEPS} · {stage.label}
      </span>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span key={i} className={cn("h-1 w-6 rounded-full", i < stage.step ? "bg-foreground" : "bg-muted")} />
        ))}
      </div>
    </div>
  );
}
