// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  hasSupabaseCredentials,
} from "@/tests/helpers/supabase-test-clients";
import { uploadSupportingMaterial } from "@/lib/materials/service";
import { listSupportingMaterials } from "@/lib/repositories/materials";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures/materials");
const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("supporting material upload (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "materials-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  async function newRequest() {
    const { data } = await admin
      .from("content_requests")
      .insert({
        owner_id: owner.userId,
        topic: "Materials test request",
        resolved_audience: "a",
        resolved_objective: "b",
        resolved_tone: "c",
      })
      .select()
      .single();
    requestIds.push(data!.id);
    return data!.id;
  }

  it("uploads, stores privately, and extracts text for a supported file", async () => {
    const requestId = await newRequest();
    const buffer = await readFile(path.join(FIXTURES_DIR, "sample.txt"));

    const material = await uploadSupportingMaterial(owner.client, {
      requestId,
      ownerId: owner.userId,
      filename: "sample.txt",
      mimeType: "text/plain",
      buffer,
    });

    expect(material.extraction_status).toBe("ready");
    expect(material.extracted_text).toContain("Koya Content Studio");
    expect(material.storage_path).toContain(owner.userId);
    expect(material.storage_path).toContain(requestId);

    const { data: storageCheck } = await admin.storage.from("content-support").download(material.storage_path);
    expect(storageCheck).not.toBeNull();

    const list = await listSupportingMaterials(owner.client, requestId);
    expect(list.some((m) => m.id === material.id)).toBe(true);
  });

  it("preserves the uploaded row with a failed status on extraction failure instead of dropping it", async () => {
    const requestId = await newRequest();
    const corrupt = Buffer.from("not a real pdf", "utf-8");

    const material = await uploadSupportingMaterial(owner.client, {
      requestId,
      ownerId: owner.userId,
      filename: "corrupt.pdf",
      mimeType: "application/pdf",
      buffer: corrupt,
    });

    expect(material.extraction_status).toBe("failed");
    expect(material.extracted_text).toBeNull();
    expect(material.extraction_error).toBeTruthy();
  });

  it("rejects an unsupported MIME type before any storage write", async () => {
    const requestId = await newRequest();
    const buffer = Buffer.from("data", "utf-8");

    await expect(
      uploadSupportingMaterial(owner.client, {
        requestId,
        ownerId: owner.userId,
        filename: "archive.zip",
        mimeType: "application/zip",
        buffer,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const list = await listSupportingMaterials(owner.client, requestId);
    expect(list).toHaveLength(0);
  });

  it("rejects a file over 10 MB", async () => {
    const requestId = await newRequest();
    const tooLarge = Buffer.alloc(10 * 1024 * 1024 + 1);

    await expect(
      uploadSupportingMaterial(owner.client, {
        requestId,
        ownerId: owner.userId,
        filename: "big.txt",
        mimeType: "text/plain",
        buffer: tooLarge,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a 6th material on the same request", async () => {
    const requestId = await newRequest();
    const buffer = await readFile(path.join(FIXTURES_DIR, "sample.txt"));

    for (let i = 0; i < 5; i += 1) {
      await uploadSupportingMaterial(owner.client, {
        requestId,
        ownerId: owner.userId,
        filename: `sample-${i}.txt`,
        mimeType: "text/plain",
        buffer,
      });
    }

    await expect(
      uploadSupportingMaterial(owner.client, {
        requestId,
        ownerId: owner.userId,
        filename: "sample-6.txt",
        mimeType: "text/plain",
        buffer,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const list = await listSupportingMaterials(owner.client, requestId);
    expect(list).toHaveLength(5);
  });
});
