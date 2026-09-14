import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { throwFromRpcError } from "@/lib/supabase/rpc";

type ContentArtifactRow = Database["public"]["Tables"]["content_artifacts"]["Row"];
type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];
type ArtifactKind = ContentArtifactRow["kind"];
type ArticleSlot = "A" | "B" | "C";

export async function getContentArtifactBySlot(
  supabase: SupabaseClient<Database>,
  requestId: string,
  kind: ArtifactKind,
  slot: ArticleSlot | null
): Promise<ContentArtifactRow | null> {
  let query = supabase.from("content_artifacts").select().eq("request_id", requestId).eq("kind", kind);
  query = slot === null ? query.is("slot", null) : query.eq("slot", slot);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function createContentArtifact(
  supabase: SupabaseClient<Database>,
  params: { requestId: string; kind: ArtifactKind; slot: ArticleSlot | null }
): Promise<ContentArtifactRow> {
  const { data, error } = await supabase
    .from("content_artifacts")
    .insert({ request_id: params.requestId, kind: params.kind, slot: params.slot })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to create content artifact");
  return data;
}

export async function listContentArtifacts(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<ContentArtifactRow[]> {
  const { data, error } = await supabase.from("content_artifacts").select().eq("request_id", requestId);
  if (error) throw error;
  return data ?? [];
}

export async function getArtifactVersion(
  supabase: SupabaseClient<Database>,
  versionId: string
): Promise<ArtifactVersionRow | null> {
  const { data, error } = await supabase.from("artifact_versions").select().eq("id", versionId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listArtifactVersions(
  supabase: SupabaseClient<Database>,
  artifactId: string
): Promise<ArtifactVersionRow[]> {
  const { data, error } = await supabase
    .from("artifact_versions")
    .select()
    .eq("artifact_id", artifactId)
    .order("version_number", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function countAutomaticRevisions(supabase: SupabaseClient<Database>, artifactId: string): Promise<number> {
  const { count, error } = await supabase
    .from("artifact_versions")
    .select("id", { count: "exact", head: true })
    .eq("artifact_id", artifactId)
    .eq("change_type", "automatic_revision");
  if (error) throw error;
  return count ?? 0;
}

/**
 * Creates a new immutable artifact version through the transactional RPC
 * (008_business_rpcs.sql / 009_rpc_optional_params.sql), which enforces
 * optimistic concurrency (STALE_VERSION) and the one-automatic-revision
 * limit. Optional fields are omitted (not passed as `null`) so the RPC's
 * SQL defaults apply — see the Task 3 build note on generated-type
 * nullability.
 */
export async function createArtifactVersion(
  supabase: SupabaseClient<Database>,
  params: {
    artifactId: string;
    expectedCurrentVersionId: string | null;
    changeType: Database["public"]["Tables"]["artifact_versions"]["Row"]["change_type"];
    content: unknown;
    contentHash: string;
    sourceSetVersionId: string;
    contentPlanId?: string | null;
    baseArticleVersionId?: string | null;
  }
): Promise<ArtifactVersionRow> {
  const { data, error } = await supabase.rpc("create_artifact_version", {
    p_artifact_id: params.artifactId,
    p_expected_current_version_id: params.expectedCurrentVersionId ?? undefined,
    p_change_type: params.changeType,
    p_content: params.content as Json,
    p_content_hash: params.contentHash,
    p_source_set_version_id: params.sourceSetVersionId,
    p_content_plan_id: params.contentPlanId ?? undefined,
    p_base_article_version_id: params.baseArticleVersionId ?? undefined,
  });
  if (error) throwFromRpcError(error, "create_artifact_version");
  if (!data) throw new Error("create_artifact_version returned no data");
  return data;
}
