import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { loadBenchmarkScenarios } from "@/lib/benchmark/service";
import { BenchmarkWorkspace } from "@/components/test-mode/benchmark-workspace";

/**
 * Test & Benchmark nav item (SYSTEM-DESIGN-NEXTJS.md §34.1) — only exists
 * while AI test mode is enabled; a Content Manager visiting this route
 * outside test mode gets a plain 404, not a degraded page.
 */
export default async function TestBenchmarkPage() {
  await requireRole("content_manager");
  if (process.env.ENABLE_AI_TEST_MODE !== "true") notFound();

  const scenarios = await loadBenchmarkScenarios();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Test &amp; Benchmark</h1>
        <p className="text-sm text-muted-foreground">
          Run a frozen scenario through each candidate model and compare actual behavior — not token counts or latency.
        </p>
      </div>
      <BenchmarkWorkspace scenarios={scenarios} />
    </div>
  );
}
