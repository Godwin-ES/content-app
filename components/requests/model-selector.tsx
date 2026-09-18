"use client";

import type { AIModelChoice } from "@/lib/domain/types";
import { Label } from "@/components/ui/label";

const MODEL_LABEL: Record<AIModelChoice, string> = {
  gemini: "Gemini",
  claude_haiku_4_5: "Claude Haiku 4.5",
  claude_sonnet_5: "Claude Sonnet 5",
};

const SELECTABLE_MODELS: AIModelChoice[] = ["gemini", "claude_haiku_4_5", "claude_sonnet_5"];

interface ModelSelectorProps {
  id: string;
  value: AIModelChoice;
  onChange: (model: AIModelChoice) => void;
  label?: string;
}

/**
 * Which model a request is generated with.
 *
 * Only rendered when the deployment permits choosing one
 * (ALLOW_MODEL_SELECTION; SYSTEM-DESIGN-NEXTJS.md §4.9, §12.4) — the
 * enclosing page owns that gate. Otherwise every request uses the
 * server-configured production model and the browser has no say. The
 * server re-validates whatever comes back regardless, so choosing freely
 * here bypasses nothing.
 */
export function ModelSelector({ id, value, onChange, label = "AI model" }: ModelSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as AIModelChoice)}
        className="h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        {SELECTABLE_MODELS.map((model) => (
          <option key={model} value={model}>
            {MODEL_LABEL[model]}
          </option>
        ))}
      </select>
    </div>
  );
}
