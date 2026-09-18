/**
 * Domains a research run will not follow.
 *
 * Every one of these puts its substance behind a sign-in or an app wall,
 * so what a retriever gets back is a login prompt, a consent page, or a
 * stub — which then costs an AI analysis call to conclude it is
 * boilerplate. Search engines index them heavily, so they crowd out pages
 * that would actually have been readable.
 *
 * This applies only to pages research found for itself. A link handed over
 * deliberately is never filtered: if you want a specific LinkedIn article
 * in the source set, that is a judgement the app has no business
 * overruling, and it may well be one you can read when the crawler cannot.
 */
const BLOCKED_HOSTS = [
  "linkedin.com",
  "reddit.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "quora.com",
  "medium.com",
  "pinterest.com",
  "tiktok.com",
];

/** Matches the host and its subdomains, never a lookalike like `notlinkedin.com`. */
export function isBlockedResearchDomain(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}
