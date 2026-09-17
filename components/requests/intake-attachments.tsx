"use client";

import { useRef, useState } from "react";
import { Paperclip, Plus, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { parseUserSuppliedUrl } from "@/lib/research/url";

const ACCEPTED_FILE_TYPES =
  ".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain";

interface IntakeAttachmentsProps {
  files: File[];
  urls: string[];
  onFilesChange: (files: File[]) => void;
  onUrlsChange: (urls: string[]) => void;
  disabled?: boolean;
}

/**
 * Supporting materials and source URLs at intake. Files go through a real
 * file picker, and URLs are added one at a time — replacing a free-text
 * box that asked for "one URL per line" and gave no feedback on whether
 * any given line was a usable link until research had already started.
 *
 * Both ride along in the form's own FormData (`materials`, `sourceUrls`),
 * so they are attached in the same submission that creates the request
 * rather than needing a request to exist first.
 */
export function IntakeAttachments({ files, urls, onFilesChange, onUrlsChange, disabled = false }: IntakeAttachmentsProps) {
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * FormData reads files off the input element, not off React state, so the
   * element's own FileList has to be rewritten whenever the list changes.
   * Without this, removing a file would only remove its chip (it would
   * still upload), and a second trip through the picker would replace the
   * first selection instead of adding to it.
   */
  function commitFiles(next: File[]) {
    const input = fileInputRef.current;
    if (input) {
      const transfer = new DataTransfer();
      for (const file of next) transfer.items.add(file);
      input.files = transfer.files;
    }
    onFilesChange(next);
  }

  function addFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const seen = new Set(files.map((f) => `${f.name}:${f.size}`));
    commitFiles([...files, ...Array.from(selected).filter((f) => !seen.has(`${f.name}:${f.size}`))]);
  }

  function addUrl() {
    const normalized = parseUserSuppliedUrl(urlDraft);
    if (!normalized) {
      setUrlError("That does not look like a web address. For example: https://example.com/article");
      return;
    }
    if (urls.includes(normalized)) {
      setUrlError("That URL has already been added.");
      return;
    }
    onUrlsChange([...urls, normalized]);
    setUrlDraft("");
    setUrlError(null);
    setUrlOpen(false);
  }

  return (
    <div className="flex flex-col gap-5 sm:col-span-2">
      <div className="flex flex-col gap-2">
        <Label>Supporting materials</Label>
        <p className="text-sm text-muted-foreground">PDF, DOCX, Markdown, or TXT.</p>

        <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit cursor-pointer", disabled && "pointer-events-none opacity-50")}>
          <Paperclip className="size-4" />
          Upload files
          <input
            ref={fileInputRef}
            type="file"
            name="materials"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            disabled={disabled}
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>

        {files.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="truncate">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => commitFiles(files.filter((_, i) => i !== index))}
                  disabled={disabled}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Source URLs</Label>
        <p className="text-sm text-muted-foreground">Add links one at a time.</p>

        {urls.map((url) => (
          <div key={url} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span className="truncate">{url}</span>
            <input type="hidden" name="sourceUrls" value={url} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${url}`}
              onClick={() => onUrlsChange(urls.filter((u) => u !== url))}
              disabled={disabled}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}

        {urlOpen ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="url"
                value={urlDraft}
                onChange={(e) => {
                  setUrlDraft(e.target.value);
                  setUrlError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  // Enter inside the intake form would otherwise submit the
                  // whole request instead of adding the URL.
                  e.preventDefault();
                  addUrl();
                }}
                placeholder="https://example.com/article"
                className="w-80"
                disabled={disabled}
                autoFocus
              />
              <Button type="button" size="sm" onClick={addUrl} disabled={disabled || !urlDraft.trim()}>
                Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setUrlDraft("");
                  setUrlError(null);
                  setUrlOpen(false);
                }}
                disabled={disabled}
              >
                Cancel
              </Button>
            </div>
            {urlError ? <p className="text-sm text-destructive">{urlError}</p> : null}
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setUrlOpen(true)} disabled={disabled}>
            <Plus className="size-4" />
            Add URL
          </Button>
        )}
      </div>
    </div>
  );
}
