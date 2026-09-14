import { Badge } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";

type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];

const CHANGE_TYPE_LABEL: Record<string, string> = {
  initial_generation: "Initial generation",
  automatic_revision: "Automatic revision",
  manual_edit: "Manual edit",
  targeted_regeneration: "Targeted revision",
  channel_adaptation: "Channel adaptation",
};

/**
 * Immutable revision history (SYSTEM-DESIGN-NEXTJS.md §18, §19). Previous
 * drafts and evaluations remain visible, never deleted or overwritten.
 */
export function VersionHistory({ versions, currentVersionId }: { versions: ArtifactVersionRow[]; currentVersionId: string | null }) {
  if (versions.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Version history</p>
      <ul className="flex flex-col gap-1">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center gap-2">
            <span>v{v.version_number}</span>
            <span>{CHANGE_TYPE_LABEL[v.change_type] ?? v.change_type}</span>
            {v.id === currentVersionId ? <Badge variant="outline">Current</Badge> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
