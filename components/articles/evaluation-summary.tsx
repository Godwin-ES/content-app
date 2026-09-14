import { Badge } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";

type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];

interface EvaluationSummaryProps {
  evaluation: EvaluationRow | null;
}

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary"> = {
  pass: "default",
  revise: "secondary",
  reject: "destructive",
};

/**
 * Compact evaluation status shown alongside an article
 * (SYSTEM-DESIGN-NEXTJS.md §17.5, §34.8). Detailed findings live in
 * EvaluationDrawer, kept secondary.
 */
export function EvaluationSummary({ evaluation }: EvaluationSummaryProps) {
  if (!evaluation) {
    return <Badge variant="outline">Not yet evaluated</Badge>;
  }

  const unsupportedCount = Array.isArray(evaluation.unsupported_claims) ? evaluation.unsupported_claims.length : 0;

  return (
    <div className="flex items-center gap-2">
      <Badge variant={STATUS_VARIANT[evaluation.overall_status] ?? "outline"}>{evaluation.overall_status}</Badge>
      {unsupportedCount > 0 ? <Badge variant="destructive">{unsupportedCount} unsupported claim(s)</Badge> : null}
    </div>
  );
}
