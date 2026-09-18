"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Plus } from "lucide-react";
import { addSourceUrlAction } from "@/actions/research";
import { uploadSupportingMaterialAction } from "@/actions/materials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Adding a URL or a file to a request that already exists.
 *
 * Both server actions have been there since intake was built; nothing
 * called them afterwards, which made "add a URL to bring in anything it
 * missed" advice about a button that did not exist. It is also the way out
 * of every dead end research can reach — nothing relevant found, supplied
 * materials all off topic — so it belongs beside the sources rather than
 * only on the form you have already left.
 *
 * Each addition lands as a `pending` source. It is not retrieved on the
 * spot: analysing one file is a different, cheaper operation than a
 * research run, and doing several at once is what the run is for.
 */
export function AddSources({ requestId, disabled = false }: { requestId: string; disabled?: boolean }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function addUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await addSourceUrlAction(requestId, trimmed);
      if (result.ok) {
        setUrl("");
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    startTransition(async () => {
      // Reported per file rather than abandoned as a batch: one rejected
      // upload must not discard the others that worked.
      const failures: string[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const result = await uploadSupportingMaterialAction(requestId, formData);
        if (!result.ok) failures.push(`${file.name}: ${result.error.message}`);
      }
      if (fileInput.current) fileInput.current.value = "";
      if (failures.length > 0) setError(failures.join("\n"));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Add a source</h3>
        <p className="text-sm text-muted-foreground">
          A link or a file to research alongside everything else. Added sources wait as pending until you start research.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="add-source-url">Link</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="add-source-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
            placeholder="https://example.com/article"
            disabled={disabled || isPending}
            className="min-w-0 flex-1"
          />
          <Button type="button" variant="outline" onClick={addUrl} disabled={disabled || isPending || !url.trim()}>
            {isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
            Add URL
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="add-source-files">Supporting materials</Label>
        <p className="text-sm text-muted-foreground">PDF, DOCX, Markdown, or TXT.</p>
        <input
          ref={fileInput}
          id="add-source-files"
          type="file"
          multiple
          accept=".pdf,.docx,.md,.markdown,.txt"
          className="hidden"
          onChange={(e) => uploadFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={disabled || isPending}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip aria-hidden className="size-4" />
          Upload files
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
