"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveManualArticleRevisionAction } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MarkdownBody } from "@/components/shared/markdown-body";
import type { ArticleOutput } from "@/lib/ai/schemas/article";

interface ArticleEditorProps {
  artifactId: string;
  content: ArticleOutput;
}

/**
 * Full-size, in-place article editing (SYSTEM-DESIGN-NEXTJS.md §19): the
 * article's own displayed layout becomes editable, not a cramped modal.
 * Manual edits always create a new immutable version and clear the prior
 * evaluation — they are not auto re-evaluated.
 */
export function ArticleEditor({ artifactId, content }: ArticleEditorProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(content.title);
  const [metaDescription, setMetaDescription] = useState(content.metaDescription);
  const [bodyMarkdown, setBodyMarkdown] = useState(content.bodyMarkdown);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function cancel() {
    setTitle(content.title);
    setMetaDescription(content.metaDescription);
    setBodyMarkdown(content.bodyMarkdown);
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const updated: ArticleOutput = { ...content, title, metaDescription, bodyMarkdown };
      const result = await saveManualArticleRevisionAction(artifactId, updated);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{content.title}</h3>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <p className="text-sm">{content.metaDescription}</p>
        <MarkdownBody className="rounded-md border p-4">{content.bodyMarkdown}</MarkdownBody>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="article-title">Title</Label>
        <Input id="article-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="article-meta">Meta description</Label>
        <Input id="article-meta" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="article-body">Body</Label>
        <Textarea
          id="article-body"
          value={bodyMarkdown}
          onChange={(e) => setBodyMarkdown(e.target.value)}
          rows={20}
          className="font-mono text-sm"
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
