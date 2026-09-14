"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/database.types";

type SourceEvidenceRow = Database["public"]["Tables"]["source_evidence"]["Row"];

interface SourceEvidenceDrawerProps {
  evidence: SourceEvidenceRow[];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Shows each evidence item's excerpt plus explicit supports/does-not-establish
 * boundaries (SYSTEM-DESIGN-NEXTJS.md §10.1, §11) so the Content Manager can
 * judge source quality without opening the original page.
 */
export function SourceEvidenceDrawer({ evidence }: SourceEvidenceDrawerProps) {
  const [open, setOpen] = useState(false);

  if (evidence.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="link" size="sm" className="w-fit px-0" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide evidence" : `View evidence (${evidence.length})`}
      </Button>
      {open ? (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          {evidence.map((item) => (
            <div key={item.id} className="flex flex-col gap-1">
              <span className="font-mono text-xs text-muted-foreground">{item.evidence_key}</span>
              <p className="italic">&ldquo;{item.excerpt}&rdquo;</p>
              <p className="text-muted-foreground">{item.conservative_summary}</p>
              <div className="flex flex-col gap-1 text-xs">
                <span>
                  <strong>Supports:</strong> {toStringArray(item.supports).join("; ") || "none stated"}
                </span>
                <span>
                  <strong>Does not establish:</strong> {toStringArray(item.limitations).join("; ") || "none stated"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
