import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getContentRequest } from "@/lib/repositories/requests";
import { listSupportingMaterials } from "@/lib/repositories/materials";
import { Badge } from "@/components/ui/badge";
import { SupportingMaterialUpload } from "@/components/requests/supporting-material-upload";

/**
 * Minimal placeholder for the request workspace. Task 19 replaces this with
 * the full Overview/Research/Articles/Channels/Approval/Publishing/Activity
 * workspace; this stands in now so the intake flow (Task 5) has somewhere to
 * land instead of a dead link.
 */
export default async function RequestWorkspacePage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  await requireCurrentUser();
  const supabase = await createSupabaseServerClient();
  const request = await getContentRequest(supabase, requestId);

  if (!request) notFound();

  const materials = await listSupportingMaterials(supabase, requestId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{request.topic}</h1>
        <Badge variant="outline">{request.status}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        The full research and review workspace for this request is under construction.
      </p>
      <SupportingMaterialUpload requestId={requestId} initialMaterials={materials} />
    </div>
  );
}
