import { describe, expect, it } from "vitest";
import { assignSourceLabels, buildEvidencePackets } from "@/lib/grounding/evidence";

describe("assignSourceLabels", () => {
  it("assigns stable, sequential S-prefixed labels in input order", () => {
    const labels = assignSourceLabels(["src-a", "src-b", "src-c"]);
    expect(labels.get("src-a")).toBe("S1");
    expect(labels.get("src-b")).toBe("S2");
    expect(labels.get("src-c")).toBe("S3");
  });
});

describe("buildEvidencePackets", () => {
  const sources = [
    { id: "src-a", publisher: "Example", canonical_url: "https://example.com/a", original_url: "https://example.com/a" },
    { id: "src-b", publisher: null, canonical_url: null, original_url: "https://example.com/b" },
  ];

  it("builds one packet per evidence item, labeled by its source", () => {
    const evidenceBySource = new Map([
      [
        "src-a",
        [
          {
            evidence_key: "E1",
            excerpt: "Some teams reported reduced workload.",
            conservative_summary: "Some teams reported reduced workload.",
            supports: ["automation reduces workload"],
            limitations: ["cost savings"],
          },
        ],
      ],
    ]);

    const packets = buildEvidencePackets(sources, evidenceBySource as never);
    expect(packets).toHaveLength(1);
    expect(packets[0].sourceLabel).toBe("S1");
    expect(packets[0].evidenceKey).toBe("E1");
    expect(packets[0].publisher).toBe("Example");
    expect(packets[0].url).toBe("https://example.com/a");
    expect(packets[0].supports).toEqual(["automation reduces workload"]);
    expect(packets[0].doesNotEstablish).toEqual(["cost savings"]);
  });

  it("falls back to the original URL when no canonical URL is stored", () => {
    const evidenceBySource = new Map([
      ["src-b", [{ evidence_key: "E1", excerpt: "x", conservative_summary: "x", supports: [], limitations: [] }]],
    ]);
    const packets = buildEvidencePackets(sources, evidenceBySource as never);
    expect(packets[0].url).toBe("https://example.com/b");
    expect(packets[0].publisher).toBeNull();
  });

  it("produces no packets for a source with no evidence rows", () => {
    const packets = buildEvidencePackets(sources, new Map() as never);
    expect(packets).toHaveLength(0);
  });
});
