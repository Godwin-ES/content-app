import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { deleteResearchSource } from "@/lib/repositories/sources";

type SupportingMaterialRow = Database["public"]["Tables"]["supporting_materials"]["Row"];

export async function listSupportingMaterials(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<SupportingMaterialRow[]> {
  const { data, error } = await supabase
    .from("supporting_materials")
    .select()
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Removing a material only makes sense while its linked source (if any)
 * hasn't been researched yet — once evidence has been extracted from it,
 * this becomes a real piece of provenance, not scratch input (same "only
 * while pending" rule deleteResearchSource enforces for a URL). The linked
 * source row is deleted first since `supporting_material_id` has no
 * cascade — the material row would otherwise be blocked by that FK.
 */
export async function deleteSupportingMaterial(supabase: SupabaseClient<Database>, materialId: string): Promise<void> {
  const { data: material, error: fetchError } = await supabase
    .from("supporting_materials")
    .select("storage_path")
    .eq("id", materialId)
    .single();
  if (fetchError) throw fetchError;

  const { data: linkedSource, error: sourceError } = await supabase
    .from("research_sources")
    .select("id, retrieval_status")
    .eq("supporting_material_id", materialId)
    .maybeSingle();
  if (sourceError) throw sourceError;

  if (linkedSource && linkedSource.retrieval_status !== "pending") {
    throw new DomainError(
      "INVALID_STATE",
      "delete_material",
      "This material has already been researched and cannot be removed."
    );
  }
  if (linkedSource) {
    await deleteResearchSource(supabase, linkedSource.id);
  }

  const { error: deleteError } = await supabase.from("supporting_materials").delete().eq("id", materialId);
  if (deleteError) throw deleteError;

  if (material?.storage_path) {
    await supabase.storage.from("content-support").remove([material.storage_path]);
  }
}
