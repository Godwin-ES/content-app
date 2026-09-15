import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSamplePack } from "@/lib/sample-pack/service";
import { SamplePackView } from "@/components/requests/sample-pack-view";
import { DomainError } from "@/lib/domain/errors";

/**
 * Printable sample-pack route (Task 21 Step 2): use the browser's own
 * print/export-to-PDF, no server-side PDF generation dependency.
 */
export default async function SamplePackPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  let pack;
  try {
    pack = await getSamplePack(supabase, requestId);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    if (error instanceof DomainError && error.code === "INVALID_STATE") {
      return (
        <div className="mx-auto max-w-2xl p-8 text-sm text-muted-foreground">
          This request has no approved package yet, so there is no sample pack to show.
        </div>
      );
    }
    throw error;
  }

  return <SamplePackView pack={pack} />;
}
