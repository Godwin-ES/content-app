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
import { requireSignedIn } from "@/lib/auth/guards";

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("auth guards and RLS permission boundaries (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  let stranger: { client: SupabaseClient<Database>; userId: string };

  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "guard-owner");
    stranger = await createTestUser(admin, "guard-other");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
    await deleteTestUser(admin, stranger.userId);
  });

  describe("requireSignedIn", () => {
    it("returns the current user", async () => {
      const user = await requireSignedIn(owner.client);
      expect(user.userId).toBe(owner.userId);
      expect(user.role).toBe("owner");
    });

    it("rejects an unauthenticated client", async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const anonClient = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      await expect(requireSignedIn(anonClient)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
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

    it("lets an account insert only its own request", async () => {
      const { error } = await owner.client.from("content_requests").insert({
        owner_id: owner.userId,
        topic: "Owner's own request",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate and build authority",
        resolved_tone: "Professional",
      });
      expect(error).toBeNull();

      const { error: spoofError } = await owner.client.from("content_requests").insert({
        owner_id: stranger.userId,
        topic: "Spoofed owner",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate and build authority",
        resolved_tone: "Professional",
      });
      expect(spoofError).not.toBeNull();
    });

    it("hides a request from every account except its owner, at any status", async () => {
      // Previously a request pending approval was visible to any reviewer.
      // With one role per account there is no status that opens a request
      // up to anyone else — the person who approves it is its owner.
      for (const status of ["draft", "content_development", "approved"] as const) {
        const request = await insertRequest(status);

        const { data: strangerView } = await stranger.client.from("content_requests").select().eq("id", request.id);
        expect(strangerView, `status ${status}`).toHaveLength(0);

        const { data: ownerView } = await owner.client.from("content_requests").select().eq("id", request.id);
        expect(ownerView, `status ${status}`).toHaveLength(1);
      }
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

  describe("package_approvals RLS", () => {
    it("rejects inserting an approval directly (no insert policy exists at all)", async () => {
      const request = await admin
        .from("content_requests")
        .insert({
          owner_id: owner.userId,
          topic: "For package_approvals RLS test",
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
      const { error } = await owner.client.from("package_approvals").insert({
        request_id: request.id,
        package_id: "00000000-0000-0000-0000-000000000000",
        approved_by: owner.userId,
      });
      expect(error).not.toBeNull();
    });
  });
});
