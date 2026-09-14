import { DomainError } from "@/lib/domain/errors";
import type { Evaluation } from "@/lib/ai/schemas/evaluation";

const MIN_PASSING_CRITICAL_SCORE = 4;

/**
 * Rejects internally inconsistent evaluator output before it is treated as
 * authoritative (SYSTEM-DESIGN-NEXTJS.md §17.5). Strong style scores cannot
 * compensate for a grounding failure: Source Grounding and Factual
 * Consistency are critical criteria (§17.2), and a significant unresolved
 * unsupported claim always prevents `pass` regardless of what the model's
 * own `overallStatus` says.
 */
export function validateEvaluationConsistency(evaluation: Evaluation, articleClaimIds: Set<string>): void {
  for (const entry of evaluation.claimAudit) {
    if (!articleClaimIds.has(entry.claimId)) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "evaluation_consistency",
        `Claim audit references unknown claim ID "${entry.claimId}" not present in the article's claim ledger.`
      );
    }
  }

  const problematicAuditEntries = evaluation.claimAudit.filter(
    (entry) => entry.status === "unsupported" || entry.status === "overreaching"
  );

  if (evaluation.overallStatus === "pass") {
    if (problematicAuditEntries.length > 0) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "evaluation_consistency",
        "Evaluation cannot be `pass` while the claim audit lists an unsupported or overreaching claim."
      );
    }
    if (evaluation.unsupportedClaims.length > 0) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "evaluation_consistency",
        "Evaluation cannot be `pass` while unsupportedClaims is non-empty."
      );
    }

    const sourceGrounding = evaluation.criteria.find((c) => c.criterion === "source_grounding");
    if (sourceGrounding && sourceGrounding.score < MIN_PASSING_CRITICAL_SCORE) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "evaluation_consistency",
        `Evaluation cannot be \`pass\` while Source Grounding scores below ${MIN_PASSING_CRITICAL_SCORE}.`
      );
    }

    const factualConsistency = evaluation.criteria.find((c) => c.criterion === "factual_consistency");
    if (factualConsistency && factualConsistency.score < MIN_PASSING_CRITICAL_SCORE) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "evaluation_consistency",
        `Evaluation cannot be \`pass\` while Factual Consistency scores below ${MIN_PASSING_CRITICAL_SCORE}.`
      );
    }
  }

  const sourceGroundingAnyStatus = evaluation.criteria.find((c) => c.criterion === "source_grounding");
  if (sourceGroundingAnyStatus && sourceGroundingAnyStatus.score === 5 && problematicAuditEntries.length >= 2) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "evaluation_consistency",
      "Source Grounding cannot score a perfect 5 while multiple claims are marked unsupported or overreaching."
    );
  }
}
