"use client";

import { useActionState, useState } from "react";
import { createContentRequestAction } from "@/actions/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResolvedDefaultsCard } from "@/components/requests/resolved-defaults-card";
import { IntakeAttachments } from "@/components/requests/intake-attachments";
import { ModelSelector } from "@/components/requests/model-selector";
import type { AIModelChoice } from "@/lib/domain/types";

export function RequestForm({ canChooseModel = false }: { canChooseModel?: boolean }) {
  const [state, formAction, pending] = useActionState(createContentRequestAction, null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [audience, setAudience] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [cta, setCta] = useState("");
  const [aiModelChoice, setAiModelChoice] = useState<AIModelChoice>("gemini");
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="topic">Topic</Label>
        <Textarea
          id="topic"
          name="topic"
          required
          rows={3}
          placeholder="What should this piece of content be about?"
        />
        <p className="text-sm text-muted-foreground">
          This is the only required field. Everything else uses a visible brand default unless you fill it in.
        </p>
      </div>

      <ResolvedDefaultsCard
        audience={audience}
        objective={objective}
        tone={tone}
        primaryKeyword={primaryKeyword}
        cta={cta}
        materialCount={files.length}
        urlCount={urls.length}
      />

      {canChooseModel ? (
        <div className="rounded-lg border p-4">
          <ModelSelector id="ai-model-choice" value={aiModelChoice} onChange={setAiModelChoice} label="AI model" />
          <input type="hidden" name="aiModelChoice" value={aiModelChoice} />
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          aria-expanded={optionalOpen}
          onClick={() => setOptionalOpen((open) => !open)}
        >
          Optional context {optionalOpen ? "−" : "+"}
        </Button>

        {optionalOpen ? (
          <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="audience">Audience</Label>
              <Input id="audience" name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="objective">Objective</Label>
              <Input id="objective" name="objective" value={objective} onChange={(e) => setObjective(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tone">Tone</Label>
              <Input id="tone" name="tone" value={tone} onChange={(e) => setTone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="primaryKeyword">Primary keyword</Label>
              <Input
                id="primaryKeyword"
                name="primaryKeyword"
                value={primaryKeyword}
                onChange={(e) => setPrimaryKeyword(e.target.value)}
                placeholder="Derived from research if left blank"
              />
              <p className="text-sm text-muted-foreground">
                The term the article should rank for. Research, the content plan and the SEO checks all work from it.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="cta">Call to action</Label>
              <Input
                id="cta"
                name="cta"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Derived from the article if left blank"
              />
              <p className="text-sm text-muted-foreground">
                What you want a reader to do next. Used by the article and every channel asset.
              </p>
            </div>
            <IntakeAttachments
              files={files}
              urls={urls}
              onFilesChange={setFiles}
              onUrlsChange={setUrls}
              disabled={pending}
            />
          </div>
        ) : null}
      </div>

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Confirming..." : "Confirm request"}
      </Button>
    </form>
  );
}
