"use client";

import { useState, useTransition } from "react";
import { runBenchmarkAction } from "@/actions/benchmark";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { BenchmarkTable } from "@/components/test-mode/benchmark-table";
import type { AIModelChoice } from "@/lib/domain/types";
import type { BenchmarkScenario, BenchmarkRunResult } from "@/lib/benchmark/service";

const ALL_MODELS: AIModelChoice[] = ["gemini", "claude_haiku_4_5", "claude_sonnet_5"];

interface BenchmarkWorkspaceProps {
  scenarios: BenchmarkScenario[];
}

/**
 * Runs the same frozen scenario independently through each selected model
 * (SYSTEM-DESIGN-NEXTJS.md §40) and compares actual behavior — never
 * token counts or latency.
 */
export function BenchmarkWorkspace({ scenarios }: BenchmarkWorkspaceProps) {
  const [scenarioKey, setScenarioKey] = useState(scenarios[0]?.key ?? "");
  const [selectedModels, setSelectedModels] = useState<Set<AIModelChoice>>(new Set(ALL_MODELS));
  const [results, setResults] = useState<Partial<Record<AIModelChoice, BenchmarkRunResult>>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const scenario = scenarios.find((s) => s.key === scenarioKey);

  function toggleModel(model: AIModelChoice) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }

  function run() {
    setError(null);
    setResults({});
    startTransition(async () => {
      const entries = await Promise.all(
        Array.from(selectedModels).map(async (model) => {
          const result = await runBenchmarkAction(scenarioKey, model);
          return { model, result };
        })
      );
      const failed = entries.find((e) => !e.result.ok);
      if (failed && !failed.result.ok) {
        setError(failed.result.error.message);
      }
      const next: Partial<Record<AIModelChoice, BenchmarkRunResult>> = {};
      for (const entry of entries) {
        if (entry.result.ok) next[entry.model] = entry.result.data;
      }
      setResults(next);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="benchmark-scenario">Scenario</Label>
          <select
            id="benchmark-scenario"
            value={scenarioKey}
            onChange={(e) => setScenarioKey(e.target.value)}
            className="h-9 min-w-64 rounded-md border bg-transparent px-3 text-sm"
          >
            {scenarios.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Models to compare</Label>
          <div className="flex gap-3">
            {ALL_MODELS.map((model) => (
              <label key={model} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={selectedModels.has(model)} onChange={() => toggleModel(model)} />
                {model}
              </label>
            ))}
          </div>
        </div>

        <Button type="button" onClick={run} disabled={isPending || selectedModels.size === 0 || !scenarioKey}>
          {isPending ? "Running..." : "Run scenario"}
        </Button>
      </div>

      {scenario ? <p className="text-sm text-muted-foreground">{scenario.description}</p> : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <BenchmarkTable entries={Object.entries(results).map(([model, result]) => ({ model: model as AIModelChoice, result: result! }))} />
    </div>
  );
}
