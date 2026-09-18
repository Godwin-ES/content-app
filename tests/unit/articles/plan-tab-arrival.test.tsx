import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanTab } from "@/components/articles/plan-tab";
import type { Database } from "@/lib/supabase/database.types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/requests/auto-mode-context", () => ({
  useAutoMode: () => ({ running: false, autoRunning: false, setRunning: vi.fn(), runningOperations: [] }),
  useOperationRunning: () => false,
}));

vi.mock("@/actions/planning", () => ({
  generateContentPlanAction: vi.fn(),
  saveManualContentPlanAction: vi.fn(),
  revertToPlanVersionAction: vi.fn(),
}));

type ContentPlanRow = Database["public"]["Tables"]["content_plans"]["Row"];

function planRow(id: string): ContentPlanRow {
  return {
    id,
    request_id: "req-1",
    source_set_version_id: "ss-1",
    version_number: 1,
    title: "AI agents in recruiting",
    primary_keyword: "AI agents in recruiting",
    secondary_keywords: ["screening"],
    search_intent: "informational",
    angle: "practical",
    sections: [
      { heading: "What they do", level: "h2", purpose: "define the category", hasFactualClaims: true, evidenceIds: ["S1:adoption"] },
    ],
    cta_direction: null,
    links: [],
    known_limitations: null,
    created_at: new Date().toISOString(),
    created_by: null,
  } as unknown as ContentPlanRow;
}

/**
 * The plan arriving is a prop change, not a mount.
 *
 * Generation finishes with router.refresh(), so the component stays
 * mounted and simply receives a plan it did not have. The draft it renders
 * from was seeded once in a useState initialiser, which does not run
 * again — so the tab went blank until something forced a remount, which is
 * what refreshing or switching tabs and returning does.
 */
describe("PlanTab when a plan arrives after generation", () => {
  it("renders the plan instead of going blank", () => {
    const { rerender } = render(<PlanTab requestId="req-1" plan={null} versions={[]} canGenerate />);
    expect(screen.getByRole("button", { name: /generate content plan/i })).toBeInTheDocument();

    const plan = planRow("plan-1");
    rerender(<PlanTab requestId="req-1" plan={plan} versions={[plan]} canGenerate />);

    expect(screen.getByText("What they do")).toBeInTheDocument();
    expect(screen.getByText("define the category")).toBeInTheDocument();
  });

  it("picks up a newly saved version rather than showing the one it was seeded with", () => {
    const first = planRow("plan-1");
    const { rerender } = render(<PlanTab requestId="req-1" plan={first} versions={[first]} canGenerate />);
    expect(screen.getByText("What they do")).toBeInTheDocument();

    const second = planRow("plan-2");
    second.sections = [
      { heading: "Where they fit", level: "h2", purpose: "map to stages", hasFactualClaims: false, evidenceIds: [] },
    ] as unknown as ContentPlanRow["sections"];
    rerender(<PlanTab requestId="req-1" plan={second} versions={[second, first]} canGenerate />);

    expect(screen.getByText("Where they fit")).toBeInTheDocument();
    expect(screen.queryByText("What they do")).not.toBeInTheDocument();
  });
});
