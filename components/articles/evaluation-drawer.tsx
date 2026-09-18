"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";

type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];

/**
 * `source_grounding` as a person would write it: Source Grounding.
 *
 * The rubric keys are identifiers, and printing an identifier with its
 * underscores swapped for spaces reads as a leaked internal name rather
 * than a heading. SEO is upper-cased as a word in its own right, because
 * "Seo Fit" is not a thing.
 */
const ACRONYMS = new Set(["seo", "ai", "cta"]);

function criterionLabel(criterion: string): string {
  return criterion
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

interface EvaluationCriterionLike {
  criterion: string;
  score: number;
  finding: string;
  recommendedAction: string | null;
}

interface DeterministicCheckLike {
  key: string;
  ok: boolean;
  message: string;
}

/**
 * The findings themselves, with no disclosure of their own, so a caller can
 * decide what reveals them — a link in the Articles tab, the verdict badge
 * in the package, or nothing at all on the printable pack.
 */
export function EvaluationDetails({ evaluation }: { evaluation: EvaluationRow }) {
  const deterministicChecks = (evaluation.deterministic_checks as unknown as DeterministicCheckLike[]) ?? [];
  const criteria = (evaluation.criteria as unknown as EvaluationCriterionLike[]) ?? [];
  const unsupportedClaims = (evaluation.unsupported_claims as unknown as string[]) ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
      <div>
        <p className="font-medium">Deterministic checks</p>
        <ul className="flex flex-col gap-1">
          {deterministicChecks.map((check) => (
            <li key={check.key} className="flex items-center gap-2">
              <Badge variant={check.ok ? "outline" : "destructive"}>{check.ok ? "OK" : "Issue"}</Badge>
              <span className="text-muted-foreground">{check.message}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="font-medium">Rubric criteria</p>
        <ul className="flex flex-col gap-1">
          {criteria.map((c) => (
            <li key={c.criterion}>
              <span className="font-medium">{criterionLabel(c.criterion)}:</span> {c.score}/5 — {c.finding}
            </li>
          ))}
        </ul>
      </div>

      {unsupportedClaims.length > 0 ? (
        <div>
          <p className="font-medium text-destructive">Unsupported claims</p>
          <ul className="list-inside list-disc">
            {unsupportedClaims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {evaluation.revision_instructions ? (
        <div>
          <p className="font-medium">Revision instructions</p>
          <p className="text-muted-foreground">{evaluation.revision_instructions}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Detailed evaluation findings, secondary to the article itself
 * (SYSTEM-DESIGN-NEXTJS.md §34.8/§34.9 evidence rail pattern). Shows both
 * the deterministic SEO checks and the AI rubric criteria/claim audit.
 */
export function EvaluationDrawer({ evaluation }: { evaluation: EvaluationRow }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="link" size="sm" className="w-fit px-0" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide evaluation details" : "View evaluation details"}
      </Button>
      {open ? <EvaluationDetails evaluation={evaluation} /> : null}
    </div>
  );
}
