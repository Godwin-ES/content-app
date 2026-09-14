import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { throwFromRpcError } from "@/lib/supabase/rpc";

type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];
type ResearchSourceInsert = Database["public"]["Tables"]["research_sources"]["Insert"];
type ResearchSourceUpdate = Database["public"]["Tables"]["research_sources"]["Update"];
type SourceEvidenceInsert = Database["public"]["Tables"]["source_evidence"]["Insert"];
type SourceEvidenceRow = Database["public"]["Tables"]["source_evidence"]["Row"];
type SourceReviewDecisionRow = Database["public"]["Tables"]["source_review_decisions"]["Row"];
type SourceConflictRow = Database["public"]["Tables"]["source_conflicts"]["Row"];
type SourceSetVersionRow = Database["public"]["Tables"]["source_set_versions"]["Row"];
type ConflictResolution = "prefer_source_a" | "prefer_source_b" | "present_both" | "avoid_claim";

export async function createResearchSource(
  supabase: SupabaseClient<Database>,
  params: ResearchSourceInsert
): Promise<ResearchSourceRow> {
  const { data, error } = await supabase.from("research_sources").insert(params).select().single();
  if (error || !data) throw error ?? new Error("Failed to create research source");
  return data;
}

export async function updateResearchSource(
  supabase: SupabaseClient<Database>,
  id: string,
  patch: ResearchSourceUpdate
): Promise<ResearchSourceRow> {
  const { data, error } = await supabase.from("research_sources").update(patch).eq("id", id).select().single();
  if (error || !data) throw error ?? new Error("Failed to update research source");
  return data;
}

export async function getResearchSource(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<ResearchSourceRow | null> {
  const { data, error } = await supabase.from("research_sources").select().eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listResearchSources(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<ResearchSourceRow[]> {
  const { data, error } = await supabase
    .from("research_sources")
    .select()
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createSourceEvidence(
  supabase: SupabaseClient<Database>,
  params: Omit<SourceEvidenceInsert, "supports" | "limitations"> & { supports: string[]; limitations: string[] }
): Promise<SourceEvidenceRow> {
  const { data, error } = await supabase
    .from("source_evidence")
    .insert({ ...params, supports: params.supports as Json, limitations: params.limitations as Json })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to create source evidence");
  return data;
}

export async function listSourceEvidence(
  supabase: SupabaseClient<Database>,
  sourceId: string
): Promise<SourceEvidenceRow[]> {
  const { data, error } = await supabase.from("source_evidence").select().eq("source_id", sourceId);
  if (error) throw error;
  return data ?? [];
}

export async function deleteSourceEvidenceForSource(supabase: SupabaseClient<Database>, sourceId: string): Promise<void> {
  const { error } = await supabase.from("source_evidence").delete().eq("source_id", sourceId);
  if (error) throw error;
}

/**
 * Append-oriented decision history (SYSTEM-DESIGN-NEXTJS.md §10.6): each
 * decision is a new row, never an update to a prior one. A source is not
 * auto-accepted merely because it was user-supplied, and an unusable/failed
 * source can never be accepted (SYSTEM-DESIGN-NEXTJS.md §10.1, §10.5).
 */
export async function recordSourceDecision(
  supabase: SupabaseClient<Database>,
  params: { sourceId: string; decision: "accepted" | "excluded"; reason: string | null; decidedBy: string }
): Promise<SourceReviewDecisionRow> {
  const source = await getResearchSource(supabase, params.sourceId);
  if (!source) throw new DomainError("NOT_FOUND", "source_decision", "Source not found.");
  if (params.decision === "accepted" && source.retrieval_status !== "usable") {
    throw new DomainError(
      "VALIDATION_ERROR",
      "source_decision",
      "Only a usable source can be accepted. Retry retrieval first if it failed."
    );
  }

  const { data, error } = await supabase
    .from("source_review_decisions")
    .insert({ source_id: params.sourceId, decision: params.decision, reason: params.reason, decided_by: params.decidedBy })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to record source decision");
  return data;
}

export async function getLatestSourceDecision(
  supabase: SupabaseClient<Database>,
  sourceId: string
): Promise<"accepted" | "excluded" | null> {
  const { data, error } = await supabase
    .from("source_review_decisions")
    .select("decision")
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.decision as "accepted" | "excluded" | undefined) ?? null;
}

export async function listSourceConflicts(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<SourceConflictRow[]> {
  const { data, error } = await supabase.from("source_conflicts").select().eq("request_id", requestId);
  if (error) throw error;
  return data ?? [];
}

export async function createSourceConflict(
  supabase: SupabaseClient<Database>,
  params: { requestId: string; sourceAId: string; sourceBId: string; description: string }
): Promise<SourceConflictRow> {
  const { data, error } = await supabase
    .from("source_conflicts")
    .insert({
      request_id: params.requestId,
      source_a_id: params.sourceAId,
      source_b_id: params.sourceBId,
      description: params.description,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to create source conflict");
  return data;
}

/**
 * Resolves a source conflict without silently choosing the source that best
 * fits an intended article angle (SYSTEM-DESIGN-NEXTJS.md §10.4): the
 * Content Manager explicitly picks one of the four resolution strategies.
 */
export async function resolveSourceConflict(
  supabase: SupabaseClient<Database>,
  params: { conflictId: string; resolution: ConflictResolution; note: string | null; resolvedBy: string }
): Promise<SourceConflictRow> {
  const { data, error } = await supabase
    .from("source_conflicts")
    .update({
      resolution: params.resolution,
      resolution_note: params.note,
      resolved_by: params.resolvedBy,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", params.conflictId)
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to resolve source conflict");
  return data;
}

/**
 * Confirms the accepted source set through the transactional RPC
 * (008_business_rpcs.sql): allocates the next immutable version, requires
 * at least one usable accepted source, and blocks on any unresolved
 * conflict.
 */
/**
 * Resolves a confirmed source-set version to the exact research_sources
 * rows it references, via source_set_items.
 */
export async function getSourceSetSources(
  supabase: SupabaseClient<Database>,
  sourceSetVersionId: string
): Promise<ResearchSourceRow[]> {
  const { data: items, error: itemsError } = await supabase
    .from("source_set_items")
    .select("source_id")
    .eq("source_set_version_id", sourceSetVersionId);
  if (itemsError) throw itemsError;

  const sourceIds = (items ?? []).map((item) => item.source_id);
  if (sourceIds.length === 0) return [];

  const { data: sources, error } = await supabase.from("research_sources").select().in("id", sourceIds);
  if (error) throw error;
  return sources ?? [];
}

export async function confirmSourceSet(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<SourceSetVersionRow> {
  const { data, error } = await supabase.rpc("confirm_source_set", { p_request_id: requestId });
  if (error) throwFromRpcError(error, "confirm_source_set");
  if (!data) throw new Error("confirm_source_set returned no data");
  return data;
}
