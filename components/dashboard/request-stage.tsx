import { cn } from "@/lib/utils";
import type { PipelineProgress } from "@/lib/workspace/next-action";

/**
 * How far along the pipeline a request is. The stage and its label come
 * straight from the same next action the request's own Overview shows, so
 * the dashboard cannot disagree with the page it links to.
 */
export function RequestStage({ progress, className }: { progress: PipelineProgress | undefined; className?: string }) {
  if (!progress) return null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">
        Step {progress.step} of {progress.totalSteps} · {progress.label}
      </span>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: progress.totalSteps }, (_, i) => (
          <span key={i} className={cn("h-1 w-6 rounded-full", i < progress.step ? "bg-foreground" : "bg-muted")} />
        ))}
      </div>
    </div>
  );
}
