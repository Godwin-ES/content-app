"use client";

import type { AIModelChoice } from "@/lib/domain/types";
import { Label } from "@/components/ui/label";

const MODEL_LABEL: Record<AIModelChoice, string> = {
  gemini: "Gemini",
  claude_haiku_4_5: "Claude Haiku 4.5",
  claude_sonnet_5: "Claude Sonnet 5",
};

const TEST_MODE_MODELS: AIModelChoice[] = ["gemini", "claude_haiku_4_5", "claude_sonnet_5"];

interface ModelSelectorProps {
  id: string;
  value: AIModelChoice;
  onChange: (model: AIModelChoice) => void;
  label?: string;
}

/**
 * Only ever rendered when AI test mode is enabled (SYSTEM-DESIGN-NEXTJS.md
 * §4.9, §12.4, Task 20 Step 3) — the enclosing page is responsible for
 * that gate. The server independently re-validates any model choice sent
 * back, so this component choosing freely here never bypasses anything.
 */
export function ModelSelector({ id, value, onChange, label = "Model" }: ModelSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as AIModelChoice)}
        className="h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        {TEST_MODE_MODELS.map((model) => (
          <option key={model} value={model}>
            {MODEL_LABEL[model]}
          </option>
        ))}
      </select>
    </div>
  );
}
