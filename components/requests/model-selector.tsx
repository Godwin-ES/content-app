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
 * The server re-validates whatever comes back against its own allowed
 * list, so choosing freely here cannot post an arbitrary model id.
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
