import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];
type ResearchSourceInsert = Database["public"]["Tables"]["research_sources"]["Insert"];
type ResearchSourceUpdate = Database["public"]["Tables"]["research_sources"]["Update"];
type SourceEvidenceInsert = Database["public"]["Tables"]["source_evidence"]["Insert"];
type SourceEvidenceRow = Database["public"]["Tables"]["source_evidence"]["Row"];

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
