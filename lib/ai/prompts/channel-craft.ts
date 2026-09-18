/**
 * What every channel adaptation has to get right, regardless of platform.
 *
 * The adapters used to be told what each post should contain and nothing
 * about how it should read, so they produced the thing a model produces
 * when only structure is specified: correct, complete, and obviously
 * machine-written. A LinkedIn post that literally printed "Problem:",
 * "Agitation:", "Solution:" as headings. An X post that opened "Artificial
 * intelligence is reshaping the music industry" — a summary, not a hook. A
 * newsletter whose every bullet was "Category Name: restatement of the
 * category".
 *
 * These rules are all negative or concrete on purpose. "Write well" is not
 * actionable; "never print the name of the structure you are using" is.
 */
export const CHANNEL_WRITING_CRAFT = [
  "HOW TO WRITE, not just what to include. You are a seasoned writer for this platform, not a summarizer. A reader should not be able to tell this was adapted from something longer.",
  "",
  "Never print the scaffolding. Any structure you are asked to follow is a shape for the writing, not a set of headings to label. Never write \"Problem:\", \"Agitation:\", \"Solution:\", \"Hook:\", \"Body:\", \"Insight:\" or any other name for the part you are currently writing. The reader should feel the structure and never see it named.",
  "Do not open by announcing the topic. \"X is transforming Y\", \"X is reshaping the Y industry\", \"In today's rapidly evolving landscape\" and every variant are throat-clearing — they tell the reader what the piece is about instead of giving them a reason to keep reading. Open on something specific: a number that surprises, a situation the reader is living in, a question they would answer yes to, or the sharpest single fact you have.",
  "Write to a person, not about a subject. Use \"you\" and \"your\" where it is natural. The reader has a job and a problem; connect what the article says to that, rather than describing a trend from above.",
  "Avoid the \"Label: sentence\" bullet. A bullet that reads \"Cost Optimization: platforms want to cut costs\" spends its first three words naming a category and its remaining words restating it. Write the bullet as a sentence that carries the information, and let it start with what matters.",
  "A number is not a sentence. Do not write a statistic and stop. Say what it means for the reader, or what changed because of it.",
  "Vary the rhythm. Do not write three sentences of the same length and shape in a row. A short one after two long ones is how emphasis works.",
  "Banned as filler, because they are what writing sounds like when it is avoiding specifics: \"delve\", \"leverage\" as a verb, \"robust\", \"seamless\", \"game-changer\", \"revolutionize\", \"unlock the power of\", \"in an era where\", \"it is worth noting that\", \"navigating the complexities of\", \"the evolving/shifting landscape\", \"reshaping\", \"stay ahead of the curve\", \"in some capacity\". Say the concrete thing instead.",
  "Write statistics as numerals: 60%, 54,000, 20.3%. Spelling them out (\"sixty percent\", \"fifty-four thousand\") makes a number the eye should catch read as ordinary prose, which is the opposite of why it is there.",
  "Use the short form of a term after its first appearance. Writing \"artificial intelligence\" in full six times reads like padding.",
  "If a call to action was supplied, use that one. You may sharpen its wording; you may not replace it with a different ask.",
  "Cut every word that is doing no work. If a sentence reads the same without a phrase, the phrase goes.",
].join("\n");

/**
 * The one rule that outranks every craft rule above it.
 *
 * Stated after them and marked as overriding, because everything above is
 * an instruction to write with more force — and the obvious way to obey
 * that instruction is to make the claims bigger. It is not permission to.
 */
export const CERTAINTY_RULE = [
  "OVERRIDING ALL OF THE ABOVE: do not increase certainty, specificity, numerical precision, causal strength, or claim scope beyond what the article states. Compressing language is fine; strengthening a claim is not.",
  'Example of what NOT to do: the article says "Some teams reported reduced administrative workload"; the adaptation must not become "AI dramatically cuts recruiter workload."',
  "Writing with more energy means choosing sharper words for the same claim, never a bigger claim. If the strongest honest version of a line is still hedged, keep it hedged.",
].join("\n");
