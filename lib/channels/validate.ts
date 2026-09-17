import {
  NEWSLETTER_MAX_WORDS,
  NEWSLETTER_MIN_WORDS,
  NEWSLETTER_INTRO_MIN_SENTENCES,
  NEWSLETTER_INTRO_MAX_SENTENCES,
  X_MAX_HASHTAGS,
} from "@/lib/channels/rules";
import type { LinkedinPost, Newsletter, XPost } from "@/lib/ai/schemas/channel";

export interface ChannelCheckResult {
  key: string;
  ok: boolean;
  message: string;
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/** Counts sentences by terminal punctuation — a plain heuristic, adequate for a 1-3-sentence range check. */
function sentenceCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return (trimmed.match(/[^.!?]+[.!?]+/g) ?? [trimmed]).length;
}

/**
 * Mechanical LinkedIn checks (SYSTEM-DESIGN-NEXTJS.md §22): the application
 * enforces these itself rather than trusting the model's own report.
 */
export function validateLinkedinPost(post: LinkedinPost): ChannelCheckResult[] {
  return [
    {
      key: "post_present",
      ok: post.body.trim().length > 0,
      message: post.body.trim().length > 0 ? "Post body is present." : "Post body is empty.",
    },
    {
      key: "has_call_to_action",
      ok: post.hasCallToAction,
      message: post.hasCallToAction ? "Call to action present." : "No call to action detected.",
    },
  ];
}

/**
 * Mechanical X checks (SYSTEM-DESIGN-NEXTJS.md §22).
 */
export function validateXPost(post: XPost): ChannelCheckResult[] {
  return [
    {
      key: "post_present",
      ok: post.body.trim().length > 0,
      message: post.body.trim().length > 0 ? "Post body is present." : "Post body is empty.",
    },
    {
      key: "hashtag_limit",
      ok: post.hashtags.length <= X_MAX_HASHTAGS,
      message:
        post.hashtags.length <= X_MAX_HASHTAGS
          ? `${post.hashtags.length} hashtag(s), within the limit of ${X_MAX_HASHTAGS}.`
          : `${post.hashtags.length} hashtags exceed the limit of ${X_MAX_HASHTAGS}.`,
    },
  ];
}

/**
 * Mechanical newsletter checks (SYSTEM-DESIGN-NEXTJS.md §22).
 */
export function validateNewsletter(newsletter: Newsletter): ChannelCheckResult[] {
  const words = wordCount(newsletter.bodyMarkdown);
  const inRange = words >= NEWSLETTER_MIN_WORDS && words <= NEWSLETTER_MAX_WORDS;
  const introSentences = sentenceCount(newsletter.introduction);
  const introInRange = introSentences >= NEWSLETTER_INTRO_MIN_SENTENCES && introSentences <= NEWSLETTER_INTRO_MAX_SENTENCES;

  return [
    {
      key: "subject_present",
      ok: newsletter.subject.trim().length > 0,
      message: newsletter.subject.trim().length > 0 ? "Subject line present." : "Subject line is empty.",
    },
    {
      key: "intro_length",
      ok: introInRange,
      message: introInRange
        ? `Introduction is ${introSentences} sentence(s), within the ${NEWSLETTER_INTRO_MIN_SENTENCES}-${NEWSLETTER_INTRO_MAX_SENTENCES} target.`
        : `Introduction is ${introSentences} sentence(s); target is ${NEWSLETTER_INTRO_MIN_SENTENCES}-${NEWSLETTER_INTRO_MAX_SENTENCES}.`,
    },
    {
      key: "body_present",
      ok: newsletter.bodyMarkdown.trim().length > 0,
      message: newsletter.bodyMarkdown.trim().length > 0 ? "Body is present." : "Body is empty.",
    },
    {
      key: "word_count_range",
      ok: inRange,
      message: inRange
        ? `Body is ${words} words, within the ${NEWSLETTER_MIN_WORDS}-${NEWSLETTER_MAX_WORDS} target.`
        : `Body is ${words} words; target is ${NEWSLETTER_MIN_WORDS}-${NEWSLETTER_MAX_WORDS}.`,
    },
    {
      key: "call_to_action_present",
      ok: newsletter.callToAction.trim().length > 0,
      message: newsletter.callToAction.trim().length > 0 ? "Call to action present." : "Call to action is missing.",
    },
    {
      key: "signoff_present",
      ok: newsletter.signoff.trim().length > 0,
      message: newsletter.signoff.trim().length > 0 ? "Signoff present." : "Signoff is missing.",
    },
  ];
}
