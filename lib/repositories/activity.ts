import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ActivityEventRow = Database["public"]["Tables"]["activity_events"]["Row"];

/**
 * activity_events has no client insert policy (see 007_rls_policies.sql):
 * business RPCs write it as security-definer, and this function covers the
 * remaining trusted-server-code events that happen outside a single RPC
 * transaction (e.g. research pipeline progress in Task 9).
 */
export async function recordActivityEvent(params: {
  requestId: string;
  eventType: string;
  message: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ActivityEventRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("activity_events")
    .insert({
      request_id: params.requestId,
      event_type: params.eventType,
      message: params.message,
      actor_id: params.actorId ?? null,
      metadata: (params.metadata ?? {}) as Json,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to record activity event");
  return data;
}

export async function listActivityEvents(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<ActivityEventRow[]> {
  const { data, error } = await supabase
    .from("activity_events")
    .select()
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
