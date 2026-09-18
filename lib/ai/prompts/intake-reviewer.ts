export interface IntakeReviewerInput {
  topic: string;
  audience: string | null;
  objective: string | null;
  tone: string | null;
  primaryKeyword: string | null;
  cta: string | null;
}

/**
 * Intake reviewer: does each answer read like a real answer to the
 * question it was given?
 *
 * One call for all five fields rather than one per field. It is five times
 * cheaper and faster, and it is the only way to catch the mismatches that
 * exist *between* fields — an audience of "CTOs" beside an objective of
 * "sell dog food" is two individually plausible answers to the wrong brief.
 *
 * The bar is deliberately low, and the prompt says so repeatedly. This
 * runs over someone else's subject matter, full of coinages, product names
 * and internal shorthand it has never seen. A reviewer that flags anything
 * unfamiliar would be wrong constantly and would train people to dismiss
 * it without reading — which is worse than not having it.
 */
export function buildIntakeReviewerPrompt(input: IntakeReviewerInput): { system: string; user: string } {
  const system = [
    "You check whether each field of a content request reads like a plausible answer to that field's question.",
    "",
    "Judge only plausibility, never quality, style or strategy. If an answer could reasonably be what someone meant for that field, it is plausible.",
    "Flag a field ONLY when it is one of:",
    "- incoherent, or clearly not language (random characters, keyboard mashing)",
    "- an answer to a different question (a topic typed into the tone field, a call to action typed into the audience field)",
    "- so vague it says nothing at all (\"stuff\", \"good\", \"people\")",
    "- contradicted by another field in a way that cannot be intentional",
    "",
    "Do NOT flag a field for being: unusual, niche, brief, informal, a brand or product name, jargon you do not recognise, a coinage, or a market you have not heard of. Unfamiliar is not implausible.",
    "When in doubt, mark it plausible. A false flag costs the writer more than a missed one.",
    "",
    "Field questions:",
    "- audience: who is this piece of content for?",
    "- objective: what should it achieve?",
    "- tone: how should it read?",
    "- primaryKeyword: the search phrase the article should rank for.",
    "- cta: what should a reader do next?",
    "",
    "Return a verdict for every field you were given, and none for fields that were not supplied.",
    "For a flagged field, `reason` is one sentence addressed to the writer: what is wrong, and what a real answer would look like. Do not restate the rule.",
    "For a field you mark plausible, leave `reason` empty.",
  ].join("\n");

  const supplied = [
    ["audience", input.audience],
    ["objective", input.objective],
    ["tone", input.tone],
    ["primaryKeyword", input.primaryKeyword],
    ["cta", input.cta],
  ].filter(([, value]) => Boolean(value && String(value).trim()));

  const user = [
    `Topic of the content request: ${input.topic}`,
    "",
    "Fields to check:",
    ...supplied.map(([field, value]) => `- ${field}: ${value}`),
  ].join("\n");

  return { system, user };
}
