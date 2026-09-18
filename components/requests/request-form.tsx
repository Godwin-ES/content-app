"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createContentRequestAction } from "@/actions/requests";
import { reviewIntakeAction } from "@/actions/intake-review";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResolvedDefaultsCard } from "@/components/requests/resolved-defaults-card";
import { IntakeAttachments } from "@/components/requests/intake-attachments";
import { ModelSelector } from "@/components/requests/model-selector";
import { IntakeFieldFlag } from "@/components/requests/intake-field-flag";
import { checkIntakeFields, type IntakeField, type IntakeFlag } from "@/lib/domain/intake-checks";
import type { AIModelChoice } from "@/lib/domain/types";

export function RequestForm({ canChooseModel = false }: { canChooseModel?: boolean }) {
  const [state, formAction, pending] = useActionState(createContentRequestAction, null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [cta, setCta] = useState("");
  const [aiModelChoice, setAiModelChoice] = useState<AIModelChoice>("gemini");
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);

  const [flags, setFlags] = useState<IntakeFlag[]>([]);
  /**
   * Fields the writer has waved through, by field rather than by message.
   *
   * The AI rewords its reasons between calls, so keying a dismissal to the
   * text meant "Use it anyway" never stuck — the next check raised the
   * same objection in different words and the form refused to submit.
   * Saying a field is fine is a judgement about the field, and it lasts
   * until the field changes.
   */
  const [dismissed, setDismissed] = useState<Set<IntakeField>>(new Set());
  /**
   * The values the AI reviewer has already seen. Pressing Confirm again
   * without editing anything should submit, not buy a second opinion on
   * text the writer has just said they are happy with.
   */
  const [reviewedValues, setReviewedValues] = useState<string | null>(null);
  const [reviewing, startReview] = useTransition();
  const [reviewError, setReviewError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const values = { topic, audience, objective, tone, primaryKeyword, cta };
  const valuesKey = JSON.stringify(values);

  // A blocking flag survives dismissal because it cannot be dismissed:
  // there is no "use it anyway" for a keyword the SEO check can never find.
  const visibleFlags = flags.filter((flag) => flag.blocking || !dismissed.has(flag.field));

  function flagsFor(field: IntakeField) {
    return visibleFlags.filter((flag) => flag.field === field);
  }

  /**
   * Editing a field retracts both its flags and its dismissal: the text
   * that was judged is gone, so neither the objection nor the override is
   * about what is in the box any more.
   */
  function updateField(field: IntakeField, value: string, setter: (v: string) => void) {
    setter(value);
    setFlags((current) => current.filter((flag) => flag.field !== field));
    setDismissed((current) => {
      if (!current.has(field)) return current;
      const next = new Set(current);
      next.delete(field);
      return next;
    });
    setReviewedValues(null);
  }

  /**
   * Checks everything in one pass, then either submits or shows every flag
   * at once.
   *
   * It used to return as soon as the deterministic checks found anything,
   * so a form with a broken topic and a mis-typed audience reported the
   * topic, waited for a fix, and only then mentioned the audience. Being
   * corrected one field at a time is worse than being corrected once: you
   * cannot see how much work is left, and each round costs another click.
   *
   * The server action runs both layers and returns their union, so the one
   * call it makes is all it takes. A clean intake still submits on the
   * first click.
   */
  function reviewThenSubmit() {
    setReviewError(null);

    // Already checked this exact text, and everything it raised has been
    // waved through — asking again would buy the same answer twice.
    if (reviewedValues === valuesKey && visibleFlags.length === 0) {
      formRef.current?.requestSubmit();
      return;
    }

    startReview(async () => {
      const result = await reviewIntakeAction({ ...values, topic });
      if (!result.ok) {
        // The reviewer is a convenience, not a gate. If it cannot run, the
        // deterministic half still has to hold, and submitting is the
        // right outcome when it does.
        setReviewError(result.error.message);
        const instant = checkIntakeFields(values).filter((flag) => flag.blocking || !dismissed.has(flag.field));
        setFlags(instant);
        if (instant.length === 0) formRef.current?.requestSubmit();
        return;
      }

      setReviewedValues(valuesKey);
      setFlags(result.data.flags);

      const unresolved = result.data.flags.filter((flag) => flag.blocking || !dismissed.has(flag.field));
      if (unresolved.length === 0) formRef.current?.requestSubmit();
    });
  }

  const busy = pending || reviewing;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="topic">Topic</Label>
        {flagsFor("topic").map((flag) => (
          <IntakeFieldFlag key={flag.message} flag={flag} onDismiss={() => setDismissed((d) => new Set(d).add("topic"))} />
        ))}
        <Textarea
          id="topic"
          name="topic"
          required
          rows={3}
          value={topic}
          onChange={(e) => updateField("topic", e.target.value, setTopic)}
          placeholder="What should this piece of content be about?"
          aria-invalid={flagsFor("topic").length > 0 || undefined}
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

        {/* A flag on a collapsed field would be invisible, so any flag on
            one of these opens the section that holds it. The topic's own
            flag renders above, outside this section. */}
        {optionalOpen || visibleFlags.some((flag) => flag.field !== "topic") ? (
          <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <IntakeField
              id="audience"
              label="Audience"
              value={audience}
              onChange={(v) => updateField("audience", v, setAudience)}
              flags={flagsFor("audience")}
              onDismiss={(flag) => setDismissed((s) => new Set(s).add(flag.field))}
              placeholder="e.g. HR leaders at mid-size firms"
            />
            <IntakeField
              id="objective"
              label="Objective"
              value={objective}
              onChange={(v) => updateField("objective", v, setObjective)}
              flags={flagsFor("objective")}
              onDismiss={(flag) => setDismissed((s) => new Set(s).add(flag.field))}
              placeholder="e.g. Educate and build authority"
            />
            <IntakeField
              id="tone"
              label="Tone"
              value={tone}
              onChange={(v) => updateField("tone", v, setTone)}
              flags={flagsFor("tone")}
              onDismiss={(flag) => setDismissed((s) => new Set(s).add(flag.field))}
              placeholder="e.g. Professional, practical"
            />
            <IntakeField
              id="primaryKeyword"
              label="Primary keyword"
              value={primaryKeyword}
              onChange={(v) => updateField("primaryKeyword", v, setPrimaryKeyword)}
              flags={flagsFor("primaryKeyword")}
              onDismiss={(flag) => setDismissed((s) => new Set(s).add(flag.field))}
              placeholder="Derived from research if left blank"
              help="The term the article should rank for. Research, the content plan and the SEO checks all work from it."
              wide
            />
            <IntakeField
              id="cta"
              label="Call to action"
              value={cta}
              onChange={(v) => updateField("cta", v, setCta)}
              flags={flagsFor("cta")}
              onDismiss={(flag) => setDismissed((s) => new Set(s).add(flag.field))}
              placeholder="Derived from the article if left blank"
              help="What you want a reader to do next. Used by the article and every channel asset."
              wide
            />
            <IntakeAttachments files={files} urls={urls} onFilesChange={setFiles} onUrlsChange={setUrls} disabled={busy} />
          </div>
        ) : null}
      </div>

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {reviewError ? (
        <Alert>
          <AlertDescription>Could not check the optional fields ({reviewError}) — submitting anyway.</AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" onClick={reviewThenSubmit} disabled={busy} className="w-fit">
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        {reviewing ? "Checking..." : pending ? "Confirming..." : "Confirm request"}
      </Button>
    </form>
  );
}

/**
 * One optional field, its flags above it.
 *
 * Spellchecking is the browser's own and comes from the Input primitive,
 * which turns it on for text fields by default: native red squiggles, in
 * the reader's own dictionary and language, for free. Unlike a grammar
 * checker it has no opinions about five-word answers.
 */
function IntakeField({
  id,
  label,
  value,
  onChange,
  flags,
  onDismiss,
  placeholder,
  help,
  wide = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  flags: IntakeFlag[];
  onDismiss: (flag: IntakeFlag) => void;
  placeholder?: string;
  help?: string;
  wide?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-2 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {flags.map((flag) => (
        <IntakeFieldFlag key={flag.message} flag={flag} onDismiss={() => onDismiss(flag)} />
      ))}
      <Input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={flags.length > 0 || undefined}
      />
      {help ? <p className="text-sm text-muted-foreground">{help}</p> : null}
    </div>
  );
}
