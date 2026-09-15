"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { AIModelChoice } from "@/lib/domain/types";
import type { BenchmarkRunResult } from "@/lib/benchmark/service";

const MODEL_LABEL: Record<AIModelChoice, string> = {
  gemini: "Gemini",
  claude_haiku_4_5: "Claude Haiku 4.5",
  claude_sonnet_5: "Claude Sonnet 5",
};

interface BenchmarkEntry {
  model: AIModelChoice;
  result: BenchmarkRunResult;
}

function StepBadge({ ok }: { ok: boolean }) {
  return <Badge variant={ok ? "outline" : "destructive"}>{ok ? "OK" : "Failed"}</Badge>;
}

/**
 * Compares actual observed behavior across models for one frozen scenario
 * (SYSTEM-DESIGN-NEXTJS.md §40) — schema reliability, grounding, evidence
 * restraint, evaluator usefulness, revision success, and channel
 * certainty preservation, plus two free-text fields for the tester's own
 * judgment (human editing needed, observed responsiveness). Deliberately
 * shows no token count or latency metric.
 */
export function BenchmarkTable({ entries }: { entries: BenchmarkEntry[] }) {
  const [notes, setNotes] = useState<Record<AIModelChoice, { editingNeeded: string; responsiveness: string }>>(
    {} as Record<AIModelChoice, { editingNeeded: string; responsiveness: string }>
  );

  function updateNote(model: AIModelChoice, field: "editingNeeded" | "responsiveness", value: string) {
    setNotes((prev) => ({ ...prev, [model]: { ...prev[model], [field]: value } }));
  }

  if (entries.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {entries.map(({ model, result }) => {
        const article = result.article.value;
        const evaluation = result.evaluation.value;
        const linkedin = result.linkedinPost.value;
        const channelEvaluation = result.channelEvaluation.value;
        const note = notes[model] ?? { editingNeeded: "", responsiveness: "" };

        return (
          <div key={model} className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{MODEL_LABEL[model]}</h4>
              <StepBadge ok={result.article.ok} />
            </div>

            {!result.article.ok ? <p className="text-sm text-destructive">{result.article.error}</p> : null}

            {article ? (
              <>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Article</p>
                  <p className="font-medium">{article.title}</p>
                  {article.insufficientEvidence ? (
                    <Badge variant="secondary">Declared insufficient evidence: {article.insufficientEvidenceReason}</Badge>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{article.bodyMarkdown}</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Deterministic SEO checks</p>
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {result.deterministicChecks.map((c) => (
                      <li key={c.key} className="flex items-center gap-2">
                        <Badge variant={c.ok ? "outline" : "destructive"}>{c.ok ? "OK" : "Issue"}</Badge>
                        <span className="text-muted-foreground">{c.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Grounding: claims without valid evidence ({result.claimsWithoutEvidence.length})
                  </p>
                  {result.claimsWithoutEvidence.length > 0 ? (
                    <ul className="list-inside list-disc text-sm text-destructive">
                      {result.claimsWithoutEvidence.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">None — every non-editorial claim cited valid evidence.</p>
                  )}
                </div>
              </>
            ) : null}

            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Evaluator</p>
              <StepBadge ok={result.evaluation.ok} />
              {evaluation ? (
                <p className="mt-1 text-sm">
                  Status: <strong>{evaluation.overallStatus}</strong>. {evaluation.revisionInstructions ?? ""}
                </p>
              ) : (
                <p className="text-sm text-destructive">{result.evaluation.error}</p>
              )}
            </div>

            {result.revisedArticle ? (
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Revision</p>
                <StepBadge ok={result.revisedArticle.ok} />
                {!result.revisedArticle.ok ? <p className="text-sm text-destructive">{result.revisedArticle.error}</p> : null}
              </div>
            ) : null}

            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">LinkedIn adaptation</p>
              <StepBadge ok={result.linkedinPost.ok} />
              {linkedin ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{linkedin.body}</p>
              ) : (
                <p className="text-sm text-destructive">{result.linkedinPost.error}</p>
              )}
              {result.linkedinChecks.map((c) => (
                <div key={c.key} className="flex items-center gap-2 text-sm">
                  <Badge variant={c.ok ? "outline" : "destructive"}>{c.ok ? "OK" : "Issue"}</Badge>
                  <span className="text-muted-foreground">{c.message}</span>
                </div>
              ))}
              {channelEvaluation ? (
                <Badge variant={channelEvaluation.certaintyInflationDetected ? "destructive" : "outline"}>
                  {channelEvaluation.certaintyInflationDetected ? "Certainty inflation detected" : "Certainty preserved"}
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`editing-${model}`}>Human editing needed (tester note)</Label>
              <Textarea
                id={`editing-${model}`}
                value={note.editingNeeded}
                onChange={(e) => updateNote(model, "editingNeeded", e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`responsiveness-${model}`}>Observed responsiveness (tester note, not a metric)</Label>
              <Textarea
                id={`responsiveness-${model}`}
                value={note.responsiveness}
                onChange={(e) => updateNote(model, "responsiveness", e.target.value)}
                rows={2}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
