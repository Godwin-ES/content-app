"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateContentPlanAction, saveManualContentPlanAction } from "@/actions/planning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContentPlanView } from "@/components/articles/content-plan-view";
import type { Database } from "@/lib/supabase/database.types";
import type { ContentPlanSection } from "@/lib/ai/schemas/content-plan";

type ContentPlanRow = Database["public"]["Tables"]["content_plans"]["Row"];

interface ContentPlanEditorProps {
  requestId: string;
  plan: ContentPlanRow | null;
  canGenerate: boolean;
}

/**
 * Generates the evidence-backed content plan, or edits an existing one.
 * Manual edits create a new immutable version (SYSTEM-DESIGN-NEXTJS.md
 * §14); the raw section evidence IDs are edited as text here rather than a
 * full evidence picker, which belongs to the richer Task 19 workspace.
 */
export function ContentPlanEditor({ requestId, plan, canGenerate }: ContentPlanEditorProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateContentPlanAction(requestId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  function submitEdit(formData: FormData) {
    setError(null);
    const title = String(formData.get("title") ?? "");
    const primaryKeyword = String(formData.get("primaryKeyword") ?? "");
    const sectionsRaw = String(formData.get("sectionsJson") ?? "[]");

    let sections: ContentPlanSection[];
    try {
      sections = JSON.parse(sectionsRaw);
    } catch {
      setError("Sections must be valid JSON.");
      return;
    }

    startTransition(async () => {
      const result = await saveManualContentPlanAction(requestId, {
        title,
        primaryKeyword,
        secondaryKeywords: (plan?.secondary_keywords as string[]) ?? [],
        searchIntent: plan?.search_intent ?? "",
        angle: plan?.angle ?? "",
        sections,
        ctaDirection: plan?.cta_direction ?? null,
        links: (plan?.links as string[]) ?? [],
        knownLimitations: plan?.known_limitations ?? null,
      });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-medium">Content Plan</h3>
        <p className="text-sm text-muted-foreground">Generate an evidence-backed outline before writing article options.</p>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="button" onClick={generate} disabled={!canGenerate || isPending} className="w-fit">
          {isPending ? "Generating..." : "Generate content plan"}
        </Button>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        <ContentPlanView plan={plan} />
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setEditing(true)}>
          Edit plan
        </Button>
      </div>
    );
  }

  return (
    <form action={submitEdit} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={plan.title} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="primaryKeyword">Primary keyword</Label>
        <Input id="primaryKeyword" name="primaryKeyword" defaultValue={plan.primary_keyword} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sectionsJson">Sections (JSON)</Label>
        <textarea
          id="sectionsJson"
          name="sectionsJson"
          rows={10}
          defaultValue={JSON.stringify(plan.sections, null, 2)}
          className="rounded-md border p-2 font-mono text-xs"
        />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save as new version"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
