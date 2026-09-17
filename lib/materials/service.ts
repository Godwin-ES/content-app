import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { extractMaterialText, SUPPORTED_MATERIAL_MIME_TYPES, type SupportedMaterialMimeType } from "@/lib/materials/extract";
import { createResearchSource } from "@/lib/repositories/sources";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_MATERIALS_PER_REQUEST = 5;
const STORAGE_BUCKET = "content-support";

type SupportingMaterialRow = Database["public"]["Tables"]["supporting_materials"]["Row"];

function safeFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.slice(-200) || "file";
}

function isSupportedMimeType(mimeType: string): mimeType is SupportedMaterialMimeType {
  return (SUPPORTED_MATERIAL_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Validates, stores privately, and extracts text for one supporting
 * material. Cheap validation (MIME type, size, count) runs before any
 * storage write (SYSTEM-DESIGN-NEXTJS.md §7.4, §8). The DB row is preserved
 * even when extraction fails, so the UI can explain what happened rather
 * than the material silently disappearing.
 */
export async function uploadSupportingMaterial(
  supabase: SupabaseClient<Database>,
  params: {
    requestId: string;
    ownerId: string;
    filename: string;
    mimeType: string;
    buffer: Buffer;
    classification?: "public" | "internal";
  }
): Promise<SupportingMaterialRow> {
  if (!isSupportedMimeType(params.mimeType)) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "material_upload",
      `Unsupported file type: ${params.mimeType}. Supported types are PDF, DOCX, Markdown, and TXT.`
    );
  }

  if (params.buffer.byteLength === 0) {
    throw new DomainError("VALIDATION_ERROR", "material_upload", "The uploaded file is empty.");
  }

  if (params.buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new DomainError("VALIDATION_ERROR", "material_upload", "File is too large. Maximum size is 10 MB.");
  }

  const { count, error: countError } = await supabase
    .from("supporting_materials")
    .select("id", { count: "exact", head: true })
    .eq("request_id", params.requestId);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_MATERIALS_PER_REQUEST) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "material_upload",
      `This request already has the maximum of ${MAX_MATERIALS_PER_REQUEST} supporting materials.`
    );
  }

  const { data: material, error: insertError } = await supabase
    .from("supporting_materials")
    .insert({
      request_id: params.requestId,
      filename: params.filename,
      mime_type: params.mimeType,
      storage_path: `pending/${crypto.randomUUID()}`,
      size_bytes: params.buffer.byteLength,
      extraction_status: "pending",
      classification: params.classification ?? "internal",
      created_by: params.ownerId,
    })
    .select()
    .single();
  if (insertError || !material) throw insertError ?? new Error("Failed to create material record");

  const storagePath = `${params.ownerId}/${params.requestId}/${material.id}/${safeFilename(params.filename)}`;

  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, params.buffer, {
    contentType: params.mimeType,
    upsert: false,
  });

  if (uploadError) {
    const { data: failedRow } = await supabase
      .from("supporting_materials")
      .update({ extraction_status: "failed", extraction_error: "Failed to store the uploaded file." })
      .eq("id", material.id)
      .select()
      .single();
    return failedRow ?? material;
  }

  const extraction = await extractMaterialText(params.buffer, params.mimeType);
  const contentHash = extraction.text ? createHash("sha256").update(extraction.text).digest("hex") : null;

  const { data: updated, error: updateError } = await supabase
    .from("supporting_materials")
    .update({
      storage_path: storagePath,
      extraction_status: extraction.status,
      extracted_text: extraction.text,
      extraction_error: extraction.error,
      content_hash: contentHash,
    })
    .eq("id", material.id)
    .select()
    .single();
  if (updateError || !updated) throw updateError ?? new Error("Failed to update material record");

  // A material with real extracted text becomes a `pending` source, the
  // same starting point a manually-added URL gets — so both show up
  // uniformly in the Research tab's one source list, each with its own
  // "Start Research" trigger, rather than materials sitting in a separate,
  // never-actually-analyzed list (SYSTEM-DESIGN-NEXTJS.md §11).
  if (updated.extraction_status === "ready" && updated.extracted_text) {
    await createResearchSource(supabase, {
      request_id: params.requestId,
      origin: "uploaded_material",
      title: params.filename,
      supporting_material_id: updated.id,
      retrieval_status: "pending",
    });
  } else if (updated.extraction_status === "failed") {
    // A file whose text could not be extracted gets a source row too, as a
    // failed one. Uploads happen at intake and the source list is the only
    // place they are shown afterwards, so without this the file would be
    // accepted and then vanish with no explanation anywhere in the UI.
    await createResearchSource(supabase, {
      request_id: params.requestId,
      origin: "uploaded_material",
      title: params.filename,
      supporting_material_id: updated.id,
      retrieval_status: "failed",
      retrieval_error: updated.extraction_error ?? "The text of this file could not be read.",
    });
  }

  return updated;
}

/**
 * Authorized, time-limited access to a private material's file (SYSTEM-DESIGN-NEXTJS.md §30.5).
 * No public storage URL is ever exposed directly.
 */
export async function getMaterialDownloadUrl(supabase: SupabaseClient<Database>, storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 60);
  if (error || !data) throw error ?? new Error("Failed to create a download link.");
  return data.signedUrl;
}
