import { createHash } from "node:crypto";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Recursively sorts object keys before serializing so equivalent objects
 * always hash identically, regardless of key insertion order. Used for
 * idempotency keys and content-package snapshot hashes (SYSTEM-DESIGN-NEXTJS.md #23, #27.1).
 */
function canonicalize(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sortedEntries = Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])] as const);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

export function hashCanonicalJson(value: Json): string {
  const canonical = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonical).digest("hex");
}
