"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import { uploadSupportingMaterial } from "@/lib/materials/service";
import { deleteSupportingMaterial } from "@/lib/repositories/materials";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import { DomainError } from "@/lib/domain/errors";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";

type SupportingMaterialRow = Database["public"]["Tables"]["supporting_materials"]["Row"];

export async function uploadSupportingMaterialAction(
  requestId: string,
  formData: FormData
): Promise<ActionResult<SupportingMaterialRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireSignedIn(supabase);

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new DomainError("VALIDATION_ERROR", "material_upload", "No file was provided.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const material = await uploadSupportingMaterial(supabase, {
      requestId,
      ownerId: user.userId,
      filename: file.name,
      mimeType: file.type,
      buffer,
    });

    return { ok: true, data: material };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "material_upload", { requestId });
    return { ok: false, error: actionError };
  }
}

export async function deleteSupportingMaterialAction(materialId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    await deleteSupportingMaterial(supabase, materialId);
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "material_delete");
    return { ok: false, error: actionError };
  }
}
