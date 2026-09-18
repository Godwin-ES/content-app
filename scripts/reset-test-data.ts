/**
 * Purges ephemeral test-fixture accounts and their content_requests
 * (Build Notes finding, Task 17: earlier ad-hoc cleanup scripts left
 * hundreds of leftover rows/users behind because they didn't paginate
 * `listUsers()`; Task 22: a second, deeper finding — several immutable-
 * provenance foreign keys in the schema don't cascade, which blocks a
 * full content_requests deletion unless its dependents are removed in a
 * specific explicit order first. See the comment above Phase 1 below.).
 *
 * Paginates `listUsers()` fully, deletes each matching user's
 * content_requests in the correct dependency order, then deletes the
 * users themselves.
 *
 * Only touches accounts matching the ephemeral `@koya-content-studio.test`
 * pattern used by this project's throwaway test fixtures, so an account
 * someone signed up with is never a target.
 *
 * Usage: pnpm tsx scripts/reset-test-data.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";

config({ path: path.resolve(__dirname, "..", ".env.local"), quiet: true });

const EPHEMERAL_EMAIL_MARKER = "@koya-content-studio.test";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Set it in .env.local before running this script.`);
  }
  return value;
}

async function listAllUsers(admin: SupabaseClient<Database>): Promise<User[]> {
  const all: User[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 200) break;
    page++;
  }
  return all;
}

async function main() {
  const admin = createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });


  const allUsers = await listAllUsers(admin);
  // The marker is the whole rule: an account created by a human through
  // the signup form can never carry it, so a real sign-in is never a target.
  const targets = allUsers.filter((u) => u.email?.includes(EPHEMERAL_EMAIL_MARKER));
  console.log(`Found ${targets.length} ephemeral test user(s) out of ${allUsers.length} total.`);

  // Phase 1: delete every matching user's owned requests.
  //
  // A genuine, if production-harmless, schema finding surfaced while
  // writing this script: several immutable-provenance foreign keys
  // (content_requests.current_package_id/current_plan_id/
  // selected_article_version_id/current_source_set_id, content_packages'
  // eight version/evaluation columns, approval_reviews.package_id,
  // publishing_queue_items.package_id/channel_artifact_version_id,
  // content_artifacts.current_version_id, operation_runs.
  // base_artifact_version_id, evaluations.operation_run_id, and
  // artifact_versions' source_set_version_id/content_plan_id) intentionally
  // don't cascade —
  // correct for the live product, which never deletes a content_requests
  // row at all (archival is a status, not a deletion). But it means a full
  // request deletion (only ever needed here, in test cleanup) requires an
  // explicit order: null out every forward pointer first (content_requests'
  // own, plus content_artifacts.current_version_id), delete operation_runs
  // (it references artifact_versions but isn't referenced back), then
  // artifact_versions itself (which content_plans/source_set_versions are
  // blocked on), then the rest in dependency order. Every step's error is
  // checked and thrown — a prior version of this script silently ignored
  // them, which is exactly how a partial failure went unnoticed for one
  // whole cohort of users across two earlier runs.
  async function must<T>(label: string, result: { error: { message: string } | null; data: T }) {
    if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
    return result.data;
  }

  let deletedRequests = 0;
  for (const user of targets) {
    const { data: requests, error } = await admin.from("content_requests").select("id").eq("owner_id", user.id);
    if (error) throw error;
    if (!requests || requests.length === 0) continue;

    const requestIds = requests.map((r) => r.id);
    const { data: artifacts, error: artifactsError } = await admin.from("content_artifacts").select("id").in("request_id", requestIds);
    if (artifactsError) throw artifactsError;
    const artifactIds = (artifacts ?? []).map((a) => a.id);

    let versionIds: string[] = [];
    if (artifactIds.length > 0) {
      const { data: versions, error: versionsError } = await admin.from("artifact_versions").select("id").in("artifact_id", artifactIds);
      if (versionsError) throw versionsError;
      versionIds = (versions ?? []).map((v) => v.id);
    }

    await must(
      "null content_requests forward pointers",
      await admin
        .from("content_requests")
        .update({ current_package_id: null, current_plan_id: null, selected_article_version_id: null, current_source_set_id: null })
        .in("id", requestIds)
    );
    if (artifactIds.length > 0) {
      await must(
        "null content_artifacts.current_version_id",
        await admin.from("content_artifacts").update({ current_version_id: null }).in("id", artifactIds)
      );
    }
    await must("delete publishing_queue_items", await admin.from("publishing_queue_items").delete().in("request_id", requestIds));
    await must("delete package_approvals", await admin.from("package_approvals").delete().in("request_id", requestIds));
    await must("delete content_packages", await admin.from("content_packages").delete().in("request_id", requestIds));
    if (versionIds.length > 0) {
      await must("delete evaluations", await admin.from("evaluations").delete().in("artifact_version_id", versionIds));
    }
    // Before operation_runs: source_evidence.source_analysis_run_id
    // references them and does not cascade.
    const { data: sourceRows } = await admin.from("research_sources").select("id").in("request_id", requestIds);
    const sourceIds = (sourceRows ?? []).map((r) => r.id);
    if (sourceIds.length > 0) {
      await must("delete source_evidence", await admin.from("source_evidence").delete().in("source_id", sourceIds));
    }
    await must("delete operation_runs", await admin.from("operation_runs").delete().in("request_id", requestIds));
    if (artifactIds.length > 0) {
      await must("delete artifact_versions", await admin.from("artifact_versions").delete().in("artifact_id", artifactIds));
    }
    await must("delete content_artifacts", await admin.from("content_artifacts").delete().in("request_id", requestIds));
    await must("delete content_plans", await admin.from("content_plans").delete().in("request_id", requestIds));
    await must("delete source_set_versions", await admin.from("source_set_versions").delete().in("request_id", requestIds));
    await must("delete content_requests", await admin.from("content_requests").delete().in("id", requestIds));
    deletedRequests += requests.length;
  }
  console.log(`Deleted ${deletedRequests} content_request(s).`);

  // Phase 2: delete the users themselves, now that cross-references
  // within this cohort (e.g. a test reviewer's decisions on another test
  // owner's now-deleted requests) are gone too.
  let deletedUsers = 0;
  let stillBlocked = 0;
  for (const user of targets) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      stillBlocked++;
      console.warn(`Could not delete ${user.email}: ${error.message}`);
    } else {
      deletedUsers++;
    }
  }
  console.log(`Deleted ${deletedUsers} user(s). ${stillBlocked} still blocked (likely referenced by a request outside this cohort).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
