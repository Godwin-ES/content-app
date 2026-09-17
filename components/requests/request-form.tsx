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
import { ModelSelector } from "@/components/test-mode/model-selector";
import type { AIModelChoice } from "@/lib/domain/types";

export function RequestForm({ testModeEnabled = false }: { testModeEnabled?: boolean }) {
  const [state, formAction, pending] = useActionState(createContentRequestAction, null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [audience, setAudience] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("");
  const [aiModelChoice, setAiModelChoice] = useState<AIModelChoice>("gemini");

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

      <ResolvedDefaultsCard audience={audience} objective={objective} tone={tone} />

      {testModeEnabled ? (
        <div className="rounded-lg border border-dashed p-4">
          <ModelSelector id="ai-model-choice" value={aiModelChoice} onChange={setAiModelChoice} label="Test mode: AI model for this request" />
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
            <IntakeAttachments disabled={pending} />
          </div>
        ) : null}
      </div>

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Starting..." : "Start research"}
      </Button>
    </form>
  );
}
