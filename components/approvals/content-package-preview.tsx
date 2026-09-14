import { Badge } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";
import type { PackageSnapshot } from "@/lib/packages/service";

type ContentPackageRow = Database["public"]["Tables"]["content_packages"]["Row"];

interface ContentPackagePreviewProps {
  contentPackage: ContentPackageRow;
}

/**
 * Read-only preview of the exact package that would be (or was) submitted
 * for approval (SYSTEM-DESIGN-NEXTJS.md §23 Step 4) — the complete public-
 * facing text, not just a reference to "the current article."
 */
export function ContentPackagePreview({ contentPackage }: ContentPackagePreviewProps) {
  const snapshot = contentPackage.snapshot as unknown as PackageSnapshot;

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Package v{contentPackage.version_number}</h3>
        <Badge variant="outline">{new Date(contentPackage.created_at).toLocaleString()}</Badge>
      </div>

      <div>
        <p className="text-xs font-medium uppercase text-muted-foreground">Article</p>
        <p className="font-medium">{snapshot.article.title}</p>
        <p className="text-sm text-muted-foreground">{snapshot.article.metaDescription}</p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase text-muted-foreground">LinkedIn</p>
        <p className="whitespace-pre-wrap text-sm">{snapshot.linkedin.body}</p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase text-muted-foreground">X</p>
        <p className="whitespace-pre-wrap text-sm">{snapshot.x.body}</p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase text-muted-foreground">Newsletter</p>
        <p className="font-medium">{snapshot.newsletter.subject}</p>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{snapshot.newsletter.bodyMarkdown}</p>
      </div>
    </div>
  );
}
