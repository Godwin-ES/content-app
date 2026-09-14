import { SHARED_GROUNDING_RULES } from "@/lib/ai/prompts/shared-grounding";

export interface ChannelAdapterInput {
  audience: string;
  tone: string;
  cta: string | null;
  articleTitle: string;
  articleBodyMarkdown: string;
}

const CERTAINTY_RULE =
  "Do not increase certainty, specificity, numerical precision, causal strength, or claim scope beyond what the article states. Compressing language is fine; strengthening a claim is not. " +
  'Example of what NOT to do: article says "Some teams reported reduced administrative workload," adaptation must not become "AI dramatically cuts recruiter workload."';

/**
 * LinkedIn Adapter (SYSTEM-DESIGN-NEXTJS.md §21.1). Adapts the already
 *-approved article only; performs no new research.
 */
export function buildLinkedinAdapterPrompt(input: ChannelAdapterInput): { system: string; user: string } {
  const system = [
    "You are the LinkedIn Adapter for a content operations tool.",
    "Adapt the supplied article into one LinkedIn post. Do not research anything new; only use what the article states.",
    "Use the PAS structure (Problem, Agitation, Solution). Keep paragraphs short. Use bullets or simple symbols where they improve clarity. Use a small number of relevant emoji only if they fit the brand tone. End with a clear call to action.",
    CERTAINTY_RULE,
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const user = [
    `Audience: ${input.audience}`,
    `Tone: ${input.tone}`,
    input.cta ? `Call to action: ${input.cta}` : "No specific call to action was supplied; propose one consistent with the article.",
    `Article title: ${input.articleTitle}`,
    `Article body:\n${input.articleBodyMarkdown}`,
  ].join("\n\n");

  return { system, user };
}
