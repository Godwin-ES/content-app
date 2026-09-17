"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MarkdownBody } from "@/components/shared/markdown-body";
import { ArticleRegenerateSectionDialog } from "@/components/articles/article-regenerate-section-dialog";
import type { ArticleOutput, ArticleSection } from "@/lib/ai/schemas/article";

interface ArticleSectionCardProps {
  articleVersionId: string;
  section: ArticleSection;
  index: number;
  defaultInstruction: string | null;
  /** The evaluation asked for changes to this section. */
  flaggedForRevision?: boolean;
  locked?: boolean;
  onChange: (index: number, section: ArticleSection) => void;
  onRegenerated: (proposal: ArticleOutput) => void;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * One article body section, editable and regeneratable in place (Phase 4
 * of the post-Task-22 UX pass) — same pattern as the plan's
 * PlanSectionCard. Regenerating replaces the whole local draft (the
 * reviser call returns a complete article, instructed to touch only this
 * section) rather than just this one entry, since that is what the
 * underlying AI call actually produces.
 */
export function ArticleSectionCard({
  articleVersionId,
  section,
  index,
  defaultInstruction,
  flaggedForRevision = false,
  locked = false,
  onChange,
  onRegenerated,
  onBusyChange,
}: ArticleSectionCardProps) {
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

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-xs uppercase text-muted-foreground">{section.level}</span>
          <CardTitle className="text-base break-words">{section.heading}</CardTitle>
          {flaggedForRevision ? (
            <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
              Needs revision
            </span>
          ) : null}
        </div>
        {!editing ? (
          <CardAction>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label={`Edit ${section.heading}`} onClick={startEditing} disabled={locked}>
                <Pencil className="size-4" />
              </Button>
              <ArticleRegenerateSectionDialog
                articleVersionId={articleVersionId}
                sectionHeading={section.heading}
                defaultInstruction={defaultInstruction}
                onRegenerated={onRegenerated}
                disabled={locked}
                onBusyChange={onBusyChange}
              />
            </div>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {editing ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`article-section-${index}-heading`}>Heading</Label>
              <Input
                id={`article-section-${index}-heading`}
                value={draft.heading}
                onChange={(e) => setDraft({ ...draft, heading: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`article-section-${index}-level`}>Level</Label>
              <select
                id={`article-section-${index}-level`}
                value={draft.level}
                onChange={(e) => setDraft({ ...draft, level: e.target.value as "h2" | "h3" })}
                className="h-9 w-24 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="h2">H2</option>
                <option value="h3">H3</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`article-section-${index}-body`}>Body</Label>
              <Textarea
                id={`article-section-${index}-body`}
                rows={10}
                className="font-mono text-sm"
                value={draft.bodyMarkdown}
                onChange={(e) => setDraft({ ...draft, bodyMarkdown: e.target.value })}
              />
            </div>
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
          <MarkdownBody>{section.bodyMarkdown}</MarkdownBody>
        )}
      </CardContent>
    </Card>
  );
}
