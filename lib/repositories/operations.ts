import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type OperationRunRow = Database["public"]["Tables"]["operation_runs"]["Row"];
type OperationRunInsert = Database["public"]["Tables"]["operation_runs"]["Insert"];
type OperationRunUpdate = Database["public"]["Tables"]["operation_runs"]["Update"];

/**
 * operation_runs has an owner-scoped RLS insert/update policy (see
 * 007_rls_policies.sql), so these use the caller's own session client
 * rather than the admin client.
 */
export async function createOperationRun(
  supabase: SupabaseClient<Database>,
  params: OperationRunInsert
): Promise<OperationRunRow> {
  const { data, error } = await supabase.from("operation_runs").insert(params).select().single();
  if (error || !data) throw error ?? new Error("Failed to create operation run");
  return data;
}

export async function updateOperationRun(
  supabase: SupabaseClient<Database>,
  id: string,
  patch: OperationRunUpdate
): Promise<OperationRunRow> {
  const { data, error } = await supabase.from("operation_runs").update(patch).eq("id", id).select().single();
  if (error || !data) throw error ?? new Error("Failed to update operation run");
  return data;
}

/**
 * Active-run deduplication (SYSTEM-DESIGN-NEXTJS.md §27.1): find an
 * already-running operation for the same logical idempotency key so a
 * repeated click reuses it instead of starting a duplicate provider call.
 */
export async function findActiveOperationRun(
  supabase: SupabaseClient<Database>,
  requestId: string,
  idempotencyKey: string
): Promise<OperationRunRow | null> {
  const { data, error } = await supabase
    .from("operation_runs")
    .select()
    .eq("request_id", requestId)
    .eq("idempotency_key", idempotencyKey)
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listOperationRuns(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<OperationRunRow[]> {
  const { data, error } = await supabase
    .from("operation_runs")
    .select()
    .eq("request_id", requestId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
