import type { ContentRequestInputParsed } from "@/lib/domain/schemas";
import type { ResolvedField, ResolvedRequestSettings } from "@/lib/domain/types";

/**
 * Visible brand defaults used when optional intake fields are absent
 * (SYSTEM-DESIGN-NEXTJS.md #7.3). The UI must show which values were
 * supplied versus resolved, so resolution tags each field's source.
 */
export const DEFAULT_REQUEST_SETTINGS = {
  audience: "Business and professional readers relevant to the topic",
  objective: "Educate and build authority",
  tone: "Professional, practical, and approachable",
  cta: null,
} as const;

function resolve<T>(supplied: T | undefined, fallback: T): ResolvedField<T> {
  return supplied === undefined
    ? { value: fallback, source: "default" }
    : { value: supplied, source: "supplied" };
}

export function resolveRequestSettings(input: ContentRequestInputParsed): ResolvedRequestSettings {
  return {
    audience: resolve(input.audience, DEFAULT_REQUEST_SETTINGS.audience),
    objective: resolve(input.objective, DEFAULT_REQUEST_SETTINGS.objective),
    tone: resolve(input.tone, DEFAULT_REQUEST_SETTINGS.tone),
    cta: resolve<string | null>(input.cta, DEFAULT_REQUEST_SETTINGS.cta),
    // Primary keyword has no static default: it is derived during research (SYSTEM-DESIGN-NEXTJS.md #7.3).
    primaryKeyword: resolve<string | null>(input.primaryKeyword, null),
  };
}
