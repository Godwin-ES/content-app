import { Badge } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";
import type { ContentPlanSection } from "@/lib/ai/schemas/content-plan";

type ContentPlanRow = Database["public"]["Tables"]["content_plans"]["Row"];

interface ContentPlanViewProps {
  plan: ContentPlanRow;
}

/**
 * Shows each proposed section with its evidence coverage
 * (SYSTEM-DESIGN-NEXTJS.md §14 Step 4). A factual section with no evidence
 * IDs should never reach this view (validated before persistence), but the
 * warning stays as a defense-in-depth display, not the enforcement point.
 */
export function ContentPlanView({ plan }: ContentPlanViewProps) {
  const sections = (plan.sections as unknown as ContentPlanSection[]) ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">{plan.title}</h3>
          <p className="text-sm text-muted-foreground">
            Primary keyword: {plan.primary_keyword} · Angle: {plan.angle ?? "n/a"} · Plan v{plan.version_number}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {sections.map((section, index) => (
          <div key={`${section.heading}-${index}`} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase text-muted-foreground">{section.level}</span>
              <span className="font-medium">{section.heading}</span>
              {section.hasFactualClaims ? (
                section.evidenceIds.length > 0 ? (
                  <Badge variant="outline">Evidence: {section.evidenceIds.join(", ")}</Badge>
                ) : (
                  <Badge variant="destructive">Missing evidence</Badge>
                )
              ) : (
                <Badge variant="secondary">Editorial</Badge>
              )}
            </div>
            <p className="text-muted-foreground">{section.purpose}</p>
          </div>
        ))}
      </div>

      {plan.known_limitations ? (
        <p className="text-sm text-muted-foreground">
          <strong>Known limitations:</strong> {plan.known_limitations}
        </p>
      ) : null}
    </div>
  );
}
