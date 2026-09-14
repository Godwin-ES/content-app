import { DomainError } from "@/lib/domain/errors";
import type { ArticleClaim } from "@/lib/ai/schemas/article";

/**
 * Deterministic grounding check applied to every article claim ledger
 * (SYSTEM-DESIGN-NEXTJS.md §11.1, §36.2): factual/inference claims must
 * cite at least one evidence ID, and every cited ID must come from the
 * request's exact current confirmed source set. Editorial claims need no
 * evidence. If the AI output refers to an unknown or excluded evidence ID,
 * the result is rejected before it can become an artifact version — never
 * silently accepted because the JSON shape was otherwise valid.
 */
export function validateClaimEvidence(claims: ArticleClaim[], validEvidenceIds: Set<string>): void {
  for (const claim of claims) {
    if (claim.claimType === "editorial") continue;

    if (claim.evidenceIds.length === 0) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "claim_validation",
        `Claim ${claim.claimId} (${claim.claimType}) cites no evidence.`
      );
    }

    for (const evidenceId of claim.evidenceIds) {
      if (!validEvidenceIds.has(evidenceId)) {
        throw new DomainError(
          "VALIDATION_ERROR",
          "claim_validation",
          `Claim ${claim.claimId} references unknown evidence ID "${evidenceId}". It must come from the current confirmed source set.`
        );
      }
    }
  }
}
