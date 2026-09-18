import "server-only";
import type { AIProvider } from "@/lib/ai/types";
import { generateArticleSection, generateArticleFrame } from "@/lib/ai/service";
import type { ArticleAngle } from "@/lib/ai/prompts/article-writer";
import type { ContentPlan } from "@/lib/ai/schemas/content-plan";
import type { ArticleLink, ArticleOutput, ArticleSection } from "@/lib/ai/schemas/article";
import type { EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";

export interface ComposeArticleInput {
  angle: ArticleAngle;
  audience: string;
  objective: string;
  tone: string;
  cta: string | null;
  plan: ContentPlan;
  evidencePackets: EvidencePacketInput[];
}

function packetId(packet: EvidencePacketInput): string {
  return `${packet.sourceLabel}:${packet.evidenceKey}`;
}

/**
 * The evidence a section is allowed to draw on.
 *
 * A section that the plan says makes factual claims gets exactly the
 * evidence the plan assigned it. A section with no assigned evidence gets
 * all of it rather than none: the plan's assignment is a guide, not a
 * cage, and a section that turns out to need a citation should be able to
 * make one correctly instead of either inventing an ID or going uncited.
 */
function evidenceForSection(packets: EvidencePacketInput[], evidenceIds: string[]): EvidencePacketInput[] {
  if (evidenceIds.length === 0) return packets;
  const wanted = new Set(evidenceIds);
  const scoped = packets.filter((packet) => wanted.has(packetId(packet)));
  return scoped.length > 0 ? scoped : packets;
}

/**
 * Writes one article by writing all of its sections at once.
 *
 * The single-call writer made an article cost the sum of its sections,
 * decoded one token at a time — several thousand output tokens, and by
 * far the longest step in the pipeline. Nothing about the sections
 * required that: the plan has already decided what each one covers and
 * which evidence it draws on, which is exactly the information a writer
 * needs to write one without having written the others. So they are
 * written concurrently, together with the title and meta description,
 * and the article costs as long as its slowest section.
 *
 * Assembly is deliberately dumb — plan order, concatenated claims, merged
 * links. Every decision that could differ between two sections was made
 * once, before they were written.
 */
export async function composeArticle(
  ai: AIProvider,
  modelId: string,
  input: ComposeArticleInput
): Promise<ArticleOutput> {
  const framePromise = generateArticleFrame(ai, modelId, {
    audience: input.audience,
    objective: input.objective,
    tone: input.tone,
    plan: input.plan,
  });

  // The title is settled before any section is written, because every
  // section is told to write under it. Waiting for just this one small
  // call costs a second or two and is what keeps the sections coherent.
  const frame = await framePromise;

  const sectionOutputs = await Promise.all(
    input.plan.sections.map((section, sectionIndex) =>
      generateArticleSection(ai, modelId, {
        angle: input.angle,
        audience: input.audience,
        objective: input.objective,
        tone: input.tone,
        cta: input.cta,
        plan: input.plan,
        section,
        sectionIndex,
        title: frame.title,
        evidencePackets: evidenceForSection(input.evidencePackets, section.evidenceIds),
      })
    )
  );

  const sections: ArticleSection[] = input.plan.sections.map((section, i) => ({
    heading: section.heading,
    level: section.level,
    bodyMarkdown: sectionOutputs[i].bodyMarkdown,
  }));

  const links: ArticleLink[] = [];
  const seenLinks = new Set<string>();
  for (const output of sectionOutputs) {
    for (const link of output.links) {
      if (seenLinks.has(link.url)) continue;
      seenLinks.add(link.url);
      links.push(link);
    }
  }

  // Claim IDs are generated per section, so two sections can independently
  // pick the same one. They are re-issued here against the assembled
  // article, since the evaluator and the grounding validator both address
  // claims by ID and a duplicate would make one of them unaddressable.
  const claims = sectionOutputs.flatMap((output, i) =>
    output.claims.map((claim, j) => ({
      ...claim,
      claimId: `C${i + 1}.${j + 1}`,
      articleSection: sections[i].heading,
    }))
  );

  const insufficient = sectionOutputs.filter((output) => output.insufficientEvidence);

  return {
    insufficientEvidence: insufficient.length > 0,
    insufficientEvidenceReason:
      insufficient.length > 0
        ? insufficient
            .map((output, i) => `${sections[i].heading}: ${output.insufficientEvidenceReason ?? "evidence insufficient"}`)
            .join(" | ")
        : null,
    title: frame.title,
    metaDescription: frame.metaDescription,
    primaryKeyword: input.plan.primaryKeyword,
    secondaryKeywords: input.plan.secondaryKeywords,
    sections,
    links,
    claims,
  };
}
