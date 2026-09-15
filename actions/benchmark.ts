"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { getAIProvider, getModelIdFor } from "@/lib/ai/provider";
import { assertAllowedAIModel } from "@/lib/ai/model-config";
import { loadBenchmarkScenarios, runBenchmarkScenario, type BenchmarkRunResult } from "@/lib/benchmark/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import { DomainError, type ActionResult } from "@/lib/domain/errors";
import type { AIModelChoice } from "@/lib/domain/types";

export async function getBenchmarkScenariosAction(): Promise<ActionResult<Awaited<ReturnType<typeof loadBenchmarkScenarios>>>> {
  try {
    if (process.env.ENABLE_AI_TEST_MODE !== "true") {
      throw new DomainError("PERMISSION_DENIED", "benchmark", "The benchmark workspace is only available in AI test mode.");
    }
    const supabase = await createSupabaseServerClient();
    await requireContentManager(supabase);
    const scenarios = await loadBenchmarkScenarios();
    return { ok: true, data: scenarios };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "get_benchmark_scenarios");
    return { ok: false, error: actionError };
  }
}

/**
 * Runs one frozen scenario through one explicitly chosen test-mode model
 * (SYSTEM-DESIGN-NEXTJS.md §40, §4.9). Gated the same way test-mode model
 * selection is gated elsewhere: rejected outright unless
 * ENABLE_AI_TEST_MODE=true, and the model choice is re-validated against
 * the enumerated allow-list regardless of what the client sent.
 */
export async function runBenchmarkAction(scenarioKey: string, model: string): Promise<ActionResult<BenchmarkRunResult>> {
  try {
    if (process.env.ENABLE_AI_TEST_MODE !== "true") {
      throw new DomainError("PERMISSION_DENIED", "benchmark", "The benchmark workspace is only available in AI test mode.");
    }
    assertAllowedAIModel(model);

    const supabase = await createSupabaseServerClient();
    await requireContentManager(supabase);

    const scenarios = await loadBenchmarkScenarios();
    const scenario = scenarios.find((s) => s.key === scenarioKey);
    if (!scenario) throw new DomainError("NOT_FOUND", "benchmark", `Unknown scenario: ${scenarioKey}`);

    const modelChoice = model as AIModelChoice;
    const ai = await getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    const result = await runBenchmarkScenario(ai, modelId, scenario);
    return { ok: true, data: result };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "run_benchmark", { scenarioKey, model });
    return { ok: false, error: actionError };
  }
}
