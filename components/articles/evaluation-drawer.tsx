"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";

type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];

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

interface EvaluationDrawerProps {
  evaluation: EvaluationRow;
}

/**
 * Detailed evaluation findings, secondary to the article itself
 * (SYSTEM-DESIGN-NEXTJS.md §34.8/§34.9 evidence rail pattern). Shows both
 * the deterministic SEO checks and the AI rubric criteria/claim audit.
 */
export function EvaluationDrawer({ evaluation }: EvaluationDrawerProps) {
  const [open, setOpen] = useState(false);

  const deterministicChecks = (evaluation.deterministic_checks as unknown as DeterministicCheckLike[]) ?? [];
  const criteria = (evaluation.criteria as unknown as EvaluationCriterionLike[]) ?? [];
  const unsupportedClaims = (evaluation.unsupported_claims as unknown as string[]) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="link" size="sm" className="w-fit px-0" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide evaluation details" : "View evaluation details"}
      </Button>
      {open ? (
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
                  <span className="font-medium">{c.criterion.replace(/_/g, " ")}:</span> {c.score}/5 — {c.finding}
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
      ) : null}
    </div>
  );
}
