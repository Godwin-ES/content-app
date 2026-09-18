"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { generateContentPlanAction, saveManualContentPlanAction, revertToPlanVersionAction } from "@/actions/planning";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PlanSectionCard } from "@/components/articles/plan-section-card";
import { RegenerationReviewBar } from "@/components/shared/regeneration-review-bar";
import { PlanRegenerateWholeDialog } from "@/components/articles/plan-regenerate-whole-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import type { Database } from "@/lib/supabase/database.types";
import type { ContentPlanSection } from "@/lib/ai/schemas/content-plan";
import type { ManualContentPlanInput } from "@/lib/planning/service";
import type { EvidencePreview } from "@/components/articles/evidence-chip";
import { useAutoMode, useOperationRunning } from "@/components/requests/auto-mode-context";

type ContentPlanRow = Database["public"]["Tables"]["content_plans"]["Row"];

interface PlanTabProps {
  requestId: string;
  plan: ContentPlanRow | null;
  versions: ContentPlanRow[];
  canGenerate: boolean;
  /** Evidence packets by ID, so a section's citations can be opened. */
  evidenceById?: Record<string, EvidencePreview>;
}

function toDraft(plan: ContentPlanRow): ManualContentPlanInput {
  return {
    title: plan.title,
    primaryKeyword: plan.primary_keyword ?? "",
    secondaryKeywords: (plan.secondary_keywords as string[] | null) ?? [],
    searchIntent: plan.search_intent ?? "",
    angle: plan.angle ?? "",
    sections: (plan.sections as unknown as ContentPlanSection[]) ?? [],
    ctaDirection: plan.cta_direction,
    links: (plan.links as string[] | null) ?? [],
    knownLimitations: plan.known_limitations,
  };
}

/**
 * The Plan tab (Phase 3 of the post-Task-22 UX pass) — split out from
 * Articles so plan generation/editing has its own focused space. Section
 * edits and regenerations only ever touch a local draft; only "Save
 * Version" persists, as one new immutable version (never overwrites the
 * one it's based on).
 */
export function PlanTab({ requestId, plan, versions, canGenerate, evidenceById }: PlanTabProps) {
  const { running: autoModeRunning } = useAutoMode();
  /**
   * Planning running anywhere — generation or a regeneration — read from
   * the operation table, so leaving this tab and coming back finds the
   * button still generating rather than offering to start again.
   */
  const planning = useOperationRunning("content_planning");
  const [draft, setDraft] = useState<ManualContentPlanInput | null>(plan ? toDraft(plan) : null);
  /**
   * Which plan version the draft was taken from.
   *
   * The draft was seeded from `plan` once, at mount, and never again — so
   * after generating a plan the refreshed props arrived with a plan while
   * the draft was still null, and the editor below returns null for a null
   * draft. The result was a blank tab that came back only on a remount,
   * which is exactly what refreshing or leaving and returning does.
   *
   * Re-seeding on a version change rather than on every render is what
   * keeps unsaved edits: the same plan re-rendering leaves the draft
   * alone, a new version replaces it.
   */
  const [draftFromVersion, setDraftFromVersion] = useState<string | null>(plan?.id ?? null);
  const [busyCount, setBusyCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [beforeRegeneration, setBeforeRegeneration] = useState<ManualContentPlanInput | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const router = useRouter();

  /**
   * Includes anything running anywhere on this request, not only work
   * started from this component — editing or reverting a plan while the
   * planner is rewriting it is two writers on one document.
   */
  const locked = busyCount > 0 || isPending || revertingId !== null || autoModeRunning || planning;
  const handleBusyChange = (busy: boolean) => setBusyCount((c) => Math.max(0, c + (busy ? 1 : -1)));

  if ((plan?.id ?? null) !== draftFromVersion) {
    setDraftFromVersion(plan?.id ?? null);
    setDraft(plan ? toDraft(plan) : null);
    setBeforeRegeneration(null);
  }

  const isDirty = plan ? JSON.stringify(draft) !== JSON.stringify(toDraft(plan)) : draft !== null;

  async function generate() {
    setError(null);
    setIsPending(true);
    const result = await generateContentPlanAction(requestId);
    setIsPending(false);
    if (result.ok) router.refresh();
    else setError(result.error.message);
  }

  function updateSection(index: number, section: ContentPlanSection) {
    if (!draft) return;
    const sections = [...draft.sections];
    sections[index] = section;
    setDraft({ ...draft, sections });
  }

  function discard() {
    setBeforeRegeneration(null);
    setDraft(plan ? toDraft(plan) : null);
    setError(null);
  }

  async function saveVersion() {
    if (!draft) return;
    setError(null);
    setIsPending(true);
    const result = await saveManualContentPlanAction(requestId, draft);
    setIsPending(false);
    setBeforeRegeneration(null);
    if (result.ok) router.refresh();
    else setError(result.error.message);
  }

  async function revert(versionId: string) {
    setError(null);
    setRevertingId(versionId);
    const result = await revertToPlanVersionAction(requestId, versionId);
    setRevertingId(null);
    if (result.ok) router.refresh();
    else setError(result.error.message);
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-medium">Content plan</h3>
        <p className="text-sm text-muted-foreground">Generate an evidence-backed outline before writing article options.</p>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p className="font-medium">The plan couldn&apos;t be generated:</p>
              <p>{error}</p>
              <p className="mt-1 text-xs">This is usually a one-off issue with a single AI response — try generating again.</p>
            </AlertDescription>
          </Alert>
        ) : null}
        <Button
          type="button"
          onClick={generate}
          disabled={!canGenerate || isPending || autoModeRunning || planning}
          className="w-fit"
        >
          {isPending || planning ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Generating...
            </>
          ) : (
            "Generate content plan"
          )}
        </Button>
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-medium break-words">{draft.title}</h2>
          <div className="flex shrink-0 gap-2">
            <PlanRegenerateWholeDialog
              requestId={requestId}
              onRegenerated={(newDraft) => {
                setBeforeRegeneration(draft);
                setDraft(newDraft);
              }}
              disabled={locked}
              onBusyChange={handleBusyChange}
            />
          </div>
        </div>
        <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
          <dt className="text-muted-foreground">Primary keyword</dt>
          <dd>{draft.primaryKeyword || "—"}</dd>
          <dt className="text-muted-foreground">Secondary keywords</dt>
          <dd>{draft.secondaryKeywords.length > 0 ? draft.secondaryKeywords.join(", ") : "—"}</dd>
          <dt className="text-muted-foreground">Angle</dt>
          <dd>{draft.angle || "—"}</dd>
          <dt className="text-muted-foreground">Version</dt>
          <dd>v{plan.version_number}</dd>
        </dl>
        {draft.knownLimitations ? (
          <p className="text-sm text-muted-foreground">
            <strong>Known limitations:</strong> {draft.knownLimitations}
          </p>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        {draft.sections.map((section, index) => (
          <PlanSectionCard
            key={index}
            requestId={requestId}
            section={section}
            index={index}
            currentDraft={{ title: draft.title, angle: draft.angle, sections: draft.sections }}
            locked={locked}
            evidenceById={evidenceById}
            onChange={updateSection}
            onRegenerated={(i, s) => {
              setBeforeRegeneration(draft);
              updateSection(i, s);
            }}
            onBusyChange={handleBusyChange}
          />
        ))}
      </div>

      {beforeRegeneration ? (
        <RegenerationReviewBar
          what="plan content"
          disabled={locked}
          onKeep={() => setBeforeRegeneration(null)}
          onUndo={() => {
            setDraft(beforeRegeneration);
            setBeforeRegeneration(null);
          }}
        />
      ) : null}

      {isDirty ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <p className="flex-1 text-sm text-muted-foreground">You have unsaved changes to this plan.</p>
          <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={locked}>
            Discard
          </Button>
          <Button type="button" size="sm" onClick={saveVersion} disabled={locked}>
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving...
              </>
            ) : (
              "Save Version"
            )}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? "Hide version history" : `Version history (${versions.length})`}
        </Button>
        {showHistory ? (
          versions.length === 0 ? (
            <EmptyState title="No versions yet" description="This plan has no history yet." />
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium">
                      v{v.version_number}: {v.title}
                    </span>
                    {v.id === plan.id ? <Badge variant="default" className="w-fit">Current</Badge> : null}
                  </div>
                  {v.id !== plan.id ? (
                    <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => revert(v.id)}>
                      {revertingId === v.id ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Reverting...
                        </>
                      ) : (
                        "Revert to this"
                      )}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
