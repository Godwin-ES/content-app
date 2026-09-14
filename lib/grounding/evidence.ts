import type { EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";

interface EvidenceSourceLike {
  id: string;
  publisher: string | null;
  canonical_url: string | null;
  original_url: string | null;
}

interface SourceEvidenceLike {
  evidence_key: string;
  excerpt: string;
  conservative_summary: string;
  supports: unknown;
  limitations: unknown;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Stable, sequential source labels (S1, S2, ...) matching the claim-ledger
 * format used throughout the AI prompts and evaluator (e.g. "S4:E1")
 * (SYSTEM-DESIGN-NEXTJS.md §11.1).
 */
export function assignSourceLabels(sourceIds: string[]): Map<string, string> {
  const labels = new Map<string, string>();
  sourceIds.forEach((id, index) => labels.set(id, `S${index + 1}`));
  return labels;
}

/**
 * Converts confirmed source-set rows into the curated evidence-packet
 * format the AI prompts consume (SYSTEM-DESIGN-NEXTJS.md §11), rather than
 * passing raw retrieved pages downstream.
 */
export function buildEvidencePackets(
  sources: EvidenceSourceLike[],
  evidenceBySource: Map<string, SourceEvidenceLike[]>
): EvidencePacketInput[] {
  const labels = assignSourceLabels(sources.map((s) => s.id));
  const packets: EvidencePacketInput[] = [];

  for (const source of sources) {
    const label = labels.get(source.id);
    if (!label) continue;
    const items = evidenceBySource.get(source.id) ?? [];

    for (const item of items) {
      packets.push({
        sourceLabel: label,
        publisher: source.publisher,
        url: source.canonical_url ?? source.original_url,
        evidenceKey: item.evidence_key,
        excerpt: item.excerpt,
        conservativeSummary: item.conservative_summary,
        supports: toStringArray(item.supports),
        doesNotEstablish: toStringArray(item.limitations),
      });
    }
  }

  return packets;
}
