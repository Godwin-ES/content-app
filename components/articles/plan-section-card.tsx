"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PlanRegenerateSectionDialog } from "@/components/articles/plan-regenerate-section-dialog";
import type { ContentPlanSection } from "@/lib/ai/schemas/content-plan";

interface PlanSectionCardProps {
  requestId: string;
  section: ContentPlanSection;
  index: number;
  currentDraft: { title: string; angle: string; sections: ContentPlanSection[] };
  locked?: boolean;
  onChange: (index: number, section: ContentPlanSection) => void;
  onRegenerated: (index: number, section: ContentPlanSection) => void;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * One plan section, editable and regeneratable in place (Phase 3 of the
 * post-Task-22 UX pass) — mirrors week-3's InlineSectionCard/
 * RegenerateSectionDialog pattern. Neither action saves anything by
 * itself; both just update the caller's shared draft, which "Save Version"
 * persists as one new plan version. Evidence sits on its own line below
 * the heading (previously crammed beside it, overflowing the card on a
 * long title) and the level/heading no longer compete for the same row's
 * width. See EvidenceList for why the IDs are chips rather than one
 * comma-separated badge.
 */
/**
 * The evidence backing a section, one chip per ID.
 *
 * These used to be joined into a comma-separated string inside a single
 * Badge. A Badge is a pill: `h-5`, `overflow-hidden`, built for one or two
 * words. A section citing eight evidence IDs therefore wrapped onto lines
 * the fixed height then clipped, leaving a cramped, half-legible strip —
 * and adding `whitespace-normal` had made it worse, because wrapping
 * inside something that cannot grow just hides more of it.
 *
 * One chip per ID is the honest unit: each is short, they wrap as a group,
 * and the container grows with however many there are.
 */
function EvidenceList({ evidenceIds }: { evidenceIds: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Evidence ({evidenceIds.length})
      </span>
      <ul className="flex flex-wrap gap-1.5">
        {evidenceIds.map((id) => (
          <li key={id}>
            {/* h-auto and whitespace-normal together: a single ID long
                enough to wrap must be able to take the height it needs. */}
            <Badge variant="outline" className="h-auto max-w-full py-0.5 font-mono break-all whitespace-normal">
              {id}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanSectionCard({ requestId, section, index, currentDraft, locked = false, onChange, onRegenerated, onBusyChange }: PlanSectionCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section);

  function startEditing() {
    setDraft(section);
    setEditing(true);
  }

  function save() {
    onChange(index, draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(section);
    setEditing(false);
  }

  const sectionLabel = section.heading || `Section ${index + 1}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-xs uppercase text-muted-foreground">{section.level}</span>
          <CardTitle className="text-base break-words">{section.heading}</CardTitle>
        </div>
        {!editing ? (
          <CardAction>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label={`Edit ${sectionLabel}`} onClick={startEditing} disabled={locked}>
                <Pencil className="size-4" />
              </Button>
              <PlanRegenerateSectionDialog
                requestId={requestId}
                sectionIndex={index}
                sectionLabel={sectionLabel}
                currentDraft={currentDraft}
                onRegenerated={(newSection) => onRegenerated(index, newSection)}
                disabled={locked}
                onRegenerationStart={() => onBusyChange?.(true)}
                onRegenerationEnd={() => onBusyChange?.(false)}
              />
            </div>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {editing ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`section-${index}-heading`}>Heading</Label>
              <Input id={`section-${index}-heading`} value={draft.heading} onChange={(e) => setDraft({ ...draft, heading: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`section-${index}-level`}>Level</Label>
              <select
                id={`section-${index}-level`}
                value={draft.level}
                onChange={(e) => setDraft({ ...draft, level: e.target.value as "h2" | "h3" })}
                className="h-9 w-24 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="h2">H2</option>
                <option value="h3">H3</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`section-${index}-purpose`}>Purpose</Label>
              <Textarea id={`section-${index}-purpose`} rows={2} value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`section-${index}-factual`}
                checked={draft.hasFactualClaims}
                onChange={(e) => setDraft({ ...draft, hasFactualClaims: e.target.checked })}
                className="size-4"
              />
              <Label htmlFor={`section-${index}-factual`} className="font-normal">
                This section makes factual claims
              </Label>
            </div>
            {draft.hasFactualClaims ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`section-${index}-evidence`}>Evidence IDs (comma-separated, e.g. S1:example_key)</Label>
                <Input
                  id={`section-${index}-evidence`}
                  value={draft.evidenceIds.join(", ")}
                  onChange={(e) =>
                    setDraft({ ...draft, evidenceIds: e.target.value.split(",").map((v) => v.trim()).filter((v) => v.length > 0) })
                  }
                />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={cancel}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={save}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {section.hasFactualClaims ? (
              section.evidenceIds.length > 0 ? (
                <EvidenceList evidenceIds={section.evidenceIds} />
              ) : (
                <Badge variant="destructive" className="w-fit">
                  Missing evidence
                </Badge>
              )
            ) : (
              <Badge variant="secondary" className="w-fit">
                Editorial
              </Badge>
            )}
            <p className="text-muted-foreground">{section.purpose}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
