"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveManualArticleRevisionAction } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArticleSectionCard } from "@/components/articles/article-section-card";
import { articleSections, type ArticleOutput } from "@/lib/ai/schemas/article";

interface ArticleOptionEditorProps {
  artifactId: string;
  articleVersionId: string;
  content: ArticleOutput;
  /** The latest evaluation's own revision note, if any — prefilled as the default Regenerate instruction (what "Auto-revise" used to apply automatically). */
  defaultInstruction: string | null;
  locked: boolean;
  onBusyChange: (busy: boolean) => void;
}

/**
 * The editable body of one article option (Phase 4 of the post-Task-22 UX
 * pass) — replaces the old single-textarea ArticleEditor and the separate
 * TargetedRevisionPanel. Title/meta-description edit inline; each body
 * section gets its own Edit/Regenerate, exactly like the Plan tab. Nothing
 * persists until "Save Version" — manual edits and AI regenerations both
 * just update this local draft first.
 */
export function ArticleOptionEditor({ artifactId, articleVersionId, content, defaultInstruction, locked, onBusyChange }: ArticleOptionEditorProps) {
  // A pre-sections article stored only `bodyMarkdown`, so its sections are
  // derived once on mount and become real the moment a version is saved.
  const [draft, setDraft] = useState<ArticleOutput>(() => ({ ...content, sections: articleSections(content) }));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const isDirty = JSON.stringify(draft) !== JSON.stringify({ ...content, sections: articleSections(content) });

  function updateSection(index: number, section: ArticleOutput["sections"][number]) {
    const sections = [...draft.sections];
    sections[index] = section;
    setDraft({ ...draft, sections });
  }

  function discard() {
    setDraft({ ...content, sections: articleSections(content) });
    setError(null);
  }

  async function saveVersion() {
    setError(null);
    setIsSaving(true);
    const result = await saveManualArticleRevisionAction(artifactId, draft);
    setIsSaving(false);
    if (result.ok) router.refresh();
    else setError(result.error.message);
  }

  const busy = locked || isSaving;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`article-${artifactId}-title`}>Title</Label>
        <Input id={`article-${artifactId}-title`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} disabled={busy} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`article-${artifactId}-meta`}>Meta description</Label>
        <Input
          id={`article-${artifactId}-meta`}
          value={draft.metaDescription}
          onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-3">
        {draft.sections.map((section, index) => (
          <ArticleSectionCard
            key={index}
            articleVersionId={articleVersionId}
            section={section}
            index={index}
            defaultInstruction={defaultInstruction}
            locked={busy}
            onChange={updateSection}
            onRegenerated={(proposal) => setDraft(proposal)}
            onBusyChange={onBusyChange}
          />
        ))}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isDirty ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <p className="flex-1 text-sm text-muted-foreground">You have unsaved changes to this option.</p>
          <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={busy}>
            Discard
          </Button>
          <Button type="button" size="sm" onClick={saveVersion} disabled={busy}>
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving...
              </>
            ) : (
              "Save Version"
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
