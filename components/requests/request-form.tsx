"use client";

import { useActionState, useState } from "react";
import { createContentRequestAction } from "@/actions/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResolvedDefaultsCard } from "@/components/requests/resolved-defaults-card";

export function RequestForm() {
  const [state, formAction, pending] = useActionState(createContentRequestAction, null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [audience, setAudience] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("");
  const [cta, setCta] = useState("");

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

      <ResolvedDefaultsCard audience={audience} objective={objective} tone={tone} cta={cta} />

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
            <div className="flex flex-col gap-2">
              <Label htmlFor="cta">Call to action</Label>
              <Input id="cta" name="cta" value={cta} onChange={(e) => setCta(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="primaryKeyword">Primary keyword</Label>
              <Input id="primaryKeyword" name="primaryKeyword" placeholder="Derived during research if left blank" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="publicationDate">Target publication date</Label>
              <Input id="publicationDate" name="publicationDate" type="date" />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="sourceUrls">Source URLs</Label>
              <Textarea id="sourceUrls" name="sourceUrls" rows={2} placeholder="One URL per line" />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="additionalInstructions">Additional instructions</Label>
              <Textarea id="additionalInstructions" name="additionalInstructions" rows={3} />
            </div>
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
