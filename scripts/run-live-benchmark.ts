/**
 * Task 22 Step 5: runs every frozen benchmark scenario through each of the
 * three candidate models against real provider APIs, and writes each run's
 * full result to ../evidence/benchmark/<scenario>.<model>.json.
 *
 * Never touches .env.local — overrides USE_FAKE_PROVIDERS in-process only,
 * since lib/ai/provider.ts reads it fresh on every call.
 *
 * Usage: pnpm tsx scripts/run-live-benchmark.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

config({ path: path.resolve(__dirname, "..", ".env.local"), quiet: true });
process.env.USE_FAKE_PROVIDERS = "false";

import { loadBenchmarkScenarios, runBenchmarkScenario } from "../lib/benchmark/service";
import { getAIProvider, getModelIdFor } from "../lib/ai/provider";
import type { AIModelChoice } from "../lib/domain/types";

async function main() {
  const models: AIModelChoice[] = ["gemini", "claude_haiku_4_5", "claude_sonnet_5"];
  const scenarios = await loadBenchmarkScenarios();
  const outDir = path.resolve(__dirname, "..", "..", "..", "evidence", "benchmark");
  await mkdir(outDir, { recursive: true });

  for (const scenario of scenarios) {
    for (const model of models) {
      const label = `${scenario.key}.${model}`;
      console.log(`Running ${label}...`);
      const started = Date.now();
      try {
        const ai = await getAIProvider(model);
        const modelId = getModelIdFor(model);
        const result = await runBenchmarkScenario(ai, modelId, scenario);
        const elapsedMs = Date.now() - started;
        await writeFile(path.join(outDir, `${label}.json`), JSON.stringify({ model, modelId, elapsedMs, result }, null, 2));
        console.log(`  done in ${elapsedMs}ms (article ${result.article.ok ? "ok" : "FAILED"}, eval ${result.evaluation.ok ? "ok" : "FAILED"})`);
      } catch (error) {
        console.error(`  ${label} threw:`, error);
        await writeFile(
          path.join(outDir, `${label}.json`),
          JSON.stringify({ model, error: error instanceof Error ? error.message : String(error) }, null, 2)
        );
      }
    }
  }
  console.log("All scenario/model combinations complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
