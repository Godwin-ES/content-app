import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];
type EvaluationInsert = Database["public"]["Tables"]["evaluations"]["Insert"];

/**
 * A failed evaluator call creates no valid evaluation row
 * (SYSTEM-DESIGN-NEXTJS.md §32.12) — the failure belongs to operation_runs.
 * This is only ever called after both the deterministic and semantic
 * validation of the AI's output have already succeeded.
 */
export async function createEvaluation(
  supabase: SupabaseClient<Database>,
  params: Omit<EvaluationInsert, "deterministic_checks" | "criteria" | "claim_audit" | "unsupported_claims" | "sections_needing_revision"> & {
    deterministicChecks: unknown;
    criteria: unknown;
    claimAudit: unknown;
    unsupportedClaims: unknown;
    sectionsNeedingRevision: unknown;
  }
): Promise<EvaluationRow> {
  const { data, error } = await supabase
    .from("evaluations")
    .insert({
      artifact_version_id: params.artifact_version_id,
      overall_status: params.overall_status,
      deterministic_checks: params.deterministicChecks as Json,
      criteria: params.criteria as Json,
      claim_audit: params.claimAudit as Json,
      unsupported_claims: params.unsupportedClaims as Json,
      sections_needing_revision: params.sectionsNeedingRevision as Json,
      revision_instructions: params.revision_instructions ?? null,
      operation_run_id: params.operation_run_id ?? null,
      created_by: params.created_by ?? null,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to create evaluation");
  return data;
}

export async function getLatestEvaluation(
  supabase: SupabaseClient<Database>,
  artifactVersionId: string
): Promise<EvaluationRow | null> {
  const { data, error } = await supabase
    .from("evaluations")
    .select()
    .eq("artifact_version_id", artifactVersionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listEvaluations(
  supabase: SupabaseClient<Database>,
  artifactVersionId: string
): Promise<EvaluationRow[]> {
  const { data, error } = await supabase
    .from("evaluations")
    .select()
    .eq("artifact_version_id", artifactVersionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
