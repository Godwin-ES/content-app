// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  hasSupabaseCredentials,
} from "@/tests/helpers/supabase-test-clients";
import { requireContentManager, requireReviewer } from "@/lib/auth/guards";

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("auth guards and RLS permission boundaries (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  let otherManager: { client: SupabaseClient<Database>; userId: string };
  let reviewer: { client: SupabaseClient<Database>; userId: string };

  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "guard-owner");
    otherManager = await createTestUser(admin, "content_manager", "guard-other");
    reviewer = await createTestUser(admin, "reviewer", "guard-reviewer");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
    await deleteTestUser(admin, otherManager.userId);
    await deleteTestUser(admin, reviewer.userId);
  });

  describe("requireContentManager / requireReviewer", () => {
    it("returns the current user when the role matches", async () => {
      const user = await requireContentManager(owner.client);
      expect(user.userId).toBe(owner.userId);
      expect(user.role).toBe("content_manager");

      const revUser = await requireReviewer(reviewer.client);
      expect(revUser.userId).toBe(reviewer.userId);
      expect(revUser.role).toBe("reviewer");
    });

    it("rejects a reviewer calling requireContentManager", async () => {
      await expect(requireContentManager(reviewer.client)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("rejects a content manager calling requireReviewer", async () => {
      await expect(requireReviewer(owner.client)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("rejects an unauthenticated client", async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const anonClient = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      await expect(requireContentManager(anonClient)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });
  });

  describe("content_requests RLS", () => {
    async function insertRequest(status: Database["public"]["Tables"]["content_requests"]["Row"]["status"]) {
      const { data, error } = await admin
        .from("content_requests")
        .insert({
          owner_id: owner.userId,
          topic: "AI agents in recruiting",
          resolved_audience: "HR leaders",
          resolved_objective: "Educate and build authority",
          resolved_tone: "Professional",
          status,
        })
        .select()
        .single();
      if (error || !data) throw error;
      requestIds.push(data.id);
      return data;
    }

    it("lets a content manager insert only their own request", async () => {
      const { error } = await owner.client.from("content_requests").insert({
        owner_id: owner.userId,
        topic: "Owner's own request",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate and build authority",
        resolved_tone: "Professional",
      });
      expect(error).toBeNull();

      const { error: spoofError } = await owner.client.from("content_requests").insert({
        owner_id: otherManager.userId,
        topic: "Spoofed owner",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate and build authority",
        resolved_tone: "Professional",
      });
      expect(spoofError).not.toBeNull();
    });

    it("rejects a reviewer inserting a content request at all", async () => {
      const { error } = await reviewer.client.from("content_requests").insert({
        owner_id: reviewer.userId,
        topic: "Reviewer should not be able to create this",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate and build authority",
        resolved_tone: "Professional",
      });
      expect(error).not.toBeNull();
    });

    it("hides a request still in content development from everyone except its owner", async () => {
      const request = await insertRequest("content_development");

      const { data: otherView } = await otherManager.client.from("content_requests").select().eq("id", request.id);
      expect(otherView).toHaveLength(0);

      const { data: reviewerView } = await reviewer.client.from("content_requests").select().eq("id", request.id);
      expect(reviewerView).toHaveLength(0);

      const { data: ownerView } = await owner.client.from("content_requests").select().eq("id", request.id);
      expect(ownerView).toHaveLength(1);
    });

    it("makes a request pending approval visible to any reviewer, but still not to an unrelated content manager", async () => {
      const request = await insertRequest("pending_approval");

      const { data: reviewerView } = await reviewer.client.from("content_requests").select().eq("id", request.id);
      expect(reviewerView).toHaveLength(1);

      const { data: otherView } = await otherManager.client.from("content_requests").select().eq("id", request.id);
      expect(otherView).toHaveLength(0);
    });

    it("has no client UPDATE policy: even the owner cannot mutate a request directly", async () => {
      const request = await insertRequest("draft");

      const { data, error } = await owner.client
        .from("content_requests")
        .update({ topic: "Mutated directly, bypassing RPCs" })
        .eq("id", request.id)
        .select();

      // No matching RLS policy means the update matches zero rows rather than erroring.
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  describe("approval_reviews RLS", () => {
    it("rejects a content manager inserting an approval decision directly (no insert policy exists at all)", async () => {
      const request = await admin
        .from("content_requests")
        .insert({
          owner_id: owner.userId,
          topic: "For approval_reviews RLS test",
          resolved_audience: "HR leaders",
          resolved_objective: "Educate and build authority",
          resolved_tone: "Professional",
          status: "content_development",
        })
        .select()
        .single()
        .then(({ data }) => {
          requestIds.push(data!.id);
          return data!;
        });

      // No table has zero rows to reference, and no insert policy grants
      // access regardless — this must be rejected by RLS before it could
      // ever reach a foreign-key check.
      const { error } = await owner.client.from("approval_reviews").insert({
        request_id: request.id,
        package_id: "00000000-0000-0000-0000-000000000000",
        submitted_by: owner.userId,
      });
      expect(error).not.toBeNull();
    });
  });
});
