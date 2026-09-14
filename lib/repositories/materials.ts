import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

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

export async function deleteSupportingMaterial(supabase: SupabaseClient<Database>, materialId: string): Promise<void> {
  const { data: material, error: fetchError } = await supabase
    .from("supporting_materials")
    .select("storage_path")
    .eq("id", materialId)
    .single();
  if (fetchError) throw fetchError;

  const { error: deleteError } = await supabase.from("supporting_materials").delete().eq("id", materialId);
  if (deleteError) throw deleteError;

  if (material?.storage_path) {
    await supabase.storage.from("content-support").remove([material.storage_path]);
  }
}
