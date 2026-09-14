import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { getSourceSetSources, listSourceEvidence } from "@/lib/repositories/sources";
import { buildEvidencePackets } from "@/lib/grounding/evidence";
import type { EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";

export interface RequestEvidenceContext {
  packets: EvidencePacketInput[];
  validEvidenceIds: Set<string>;
}

/**
 * Loads the curated evidence context for a request's exact confirmed
 * source set (SYSTEM-DESIGN-NEXTJS.md §11, §14). Shared by content
 * planning, article generation, and revision so they all validate claim/
 * plan evidence references against the same authoritative set. Split out
 * from lib/grounding/evidence.ts (which stays server-only-free) because
 * this function touches Supabase and must never be pulled into a client
 * bundle — a client component importing the pure label/packet helpers
 * from the same file would otherwise drag `server-only` in with it.
 */
export async function getEvidenceContextForRequest(
  supabase: SupabaseClient<Database>,
  request: { id: string; current_source_set_id: string | null }
): Promise<RequestEvidenceContext> {
  if (!request.current_source_set_id) {
    throw new DomainError("INVALID_STATE", "evidence_context", "This request has no confirmed source set yet.");
  }

  const sources = await getSourceSetSources(supabase, request.current_source_set_id);
  const evidenceBySource = new Map<string, Awaited<ReturnType<typeof listSourceEvidence>>>();
  for (const source of sources) {
    evidenceBySource.set(source.id, await listSourceEvidence(supabase, source.id));
  }
  const packets = buildEvidencePackets(sources, evidenceBySource);
  const validEvidenceIds = new Set(packets.map((p) => `${p.sourceLabel}:${p.evidenceKey}`));
  return { packets, validEvidenceIds };
}
