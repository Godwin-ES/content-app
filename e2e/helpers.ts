import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createAdminClient, createTestUser, deleteTestUser } from "@/tests/helpers/supabase-test-clients";

export { createAdminClient, createTestUser, deleteTestUser };

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}

// Deliberately reimplements a thin slice of lib/packages/service.ts's
// snapshot/RPC call using only raw Supabase calls, never importing
// anything under lib/ that carries `import "server-only"` — Playwright's
// test runner has no equivalent of vitest.config.ts's server-only stub
// alias, so a direct import of a server-only module throws "This module
// cannot be imported from a Client Component module" when a spec file
// pulls it in. Every real business rule this bypasses (readiness,
// optimistic concurrency, RLS) is still enforced by the same RPCs these
// calls go through — this only skips the *pure TypeScript* orchestration
// layer, not the actual guarantees.
function canonicalize(value: unknown): Json {
  if (Array.isArray(value)) return value.map(canonicalize) as Json;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, canonicalize((value as Record<string, unknown>)[k])])) as Json;
  }
  return value as Json;
}
function hashCanonicalJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function articleContent(title = "Article") {
  return {
    insufficientEvidence: false,
    insufficientEvidenceReason: null,
    title,
    metaDescription: "meta",
    primaryKeyword: "ai agents in recruiting",
    secondaryKeywords: [],
    bodyMarkdown: `# ${title}\n\nSome teams reported reduced workload.`,
    links: [],
    claims: [],
  };
}
function linkedinContent() {
  return { body: "A LinkedIn post.", hasCallToAction: true };
}
function xContent() {
  return { body: "An X post.", hashtags: [] };
}
function newsletterContent() {
  return { subject: "Subject", introduction: "Intro", bodyMarkdown: "Body", callToAction: "Read more", signoff: "Best" };
}

async function createVersion(
  admin: SupabaseClient<Database>,
  ownerClient: SupabaseClient<Database>,
  kind: "article" | "linkedin" | "x" | "newsletter",
  requestId: string,
  sourceSetId: string,
  content: unknown
) {
  const { data: artifact } = await admin
    .from("content_artifacts")
    .insert({ request_id: requestId, kind, slot: kind === "article" ? "A" : null })
    .select()
    .single();
  const { data: version } = await ownerClient.rpc("create_artifact_version", {
    p_artifact_id: artifact!.id,
    p_change_type: kind === "article" ? "initial_generation" : "channel_adaptation",
    p_content: content as Json,
    p_content_hash: `hash-${kind}-${Math.random()}`,
    p_source_set_version_id: sourceSetId,
  });
  return { artifactId: artifact!.id, versionId: (version as { id: string }).id };
}

async function passingEvaluation(admin: SupabaseClient<Database>, versionId: string): Promise<string> {
  const { data } = await admin
    .from("evaluations")
    .insert({
      artifact_version_id: versionId,
      overall_status: "pass",
      deterministic_checks: [],
      criteria: [],
      claim_audit: [],
      unsupported_claims: [],
      sections_needing_revision: [],
    })
    .select()
    .single();
  return data!.id;
}

/**
 * Builds a request all the way to a fully-ready-to-approve state (selected
 * passing article, all three passing channels, a created package) via
 * direct admin/RPC calls — mirrors `tests/integration/approval-workflow.
 * test.ts`'s fixture helper, reused here so E2E specs don't re-derive the
 * whole research→plan→article pipeline through the UI just to reach the
 * part they're actually testing.
 */
export async function seedFullyReadyRequest(
  admin: SupabaseClient<Database>,
  ownerClient: SupabaseClient<Database>,
  ownerId: string,
  topic = "AI agents in recruiting"
): Promise<{ requestId: string; articleArtifactId: string; packageId: string }> {
  const { data: request } = await admin
    .from("content_requests")
    .insert({
      owner_id: ownerId,
      topic,
      resolved_audience: "HR leaders",
      resolved_objective: "Educate",
      resolved_tone: "Professional",
      status: "content_development",
    })
    .select()
    .single();

  const { data: source } = await admin
    .from("research_sources")
    .insert({ request_id: request!.id, origin: "researched", original_url: "https://example.com/a", retrieval_status: "usable" })
    .select()
    .single();
  const { data: sourceSet } = await admin
    .from("source_set_versions")
    .insert({ request_id: request!.id, version_number: 1, confirmed_by: ownerId })
    .select()
    .single();
  await admin.from("source_set_items").insert({ source_set_version_id: sourceSet!.id, source_id: source!.id });
  await admin.from("content_requests").update({ current_source_set_id: sourceSet!.id }).eq("id", request!.id);

  const article = await createVersion(admin, ownerClient, "article", request!.id, sourceSet!.id, articleContent());
  const articleEvaluationId = await passingEvaluation(admin, article.versionId);
  await admin.from("content_requests").update({ selected_article_version_id: article.versionId }).eq("id", request!.id);

  const channelVersions: Record<"linkedin" | "x" | "newsletter", { versionId: string; evaluationId: string }> = {} as never;
  for (const kind of ["linkedin", "x", "newsletter"] as const) {
    const content = kind === "linkedin" ? linkedinContent() : kind === "x" ? xContent() : newsletterContent();
    const v = await createVersion(admin, ownerClient, kind, request!.id, sourceSet!.id, content);
    const evaluationId = await passingEvaluation(admin, v.versionId);
    channelVersions[kind] = { versionId: v.versionId, evaluationId };
  }

  const snapshot = {
    article: articleContent(),
    linkedin: linkedinContent(),
    x: xContent(),
    newsletter: newsletterContent(),
    sourceSetVersionId: sourceSet!.id,
    versionIds: {
      article: article.versionId,
      linkedin: channelVersions.linkedin.versionId,
      x: channelVersions.x.versionId,
      newsletter: channelVersions.newsletter.versionId,
    },
  };

  const { data: pkg } = await ownerClient.rpc("create_content_package", {
    p_request_id: request!.id,
    p_article_version_id: article.versionId,
    p_article_evaluation_id: articleEvaluationId,
    p_linkedin_version_id: channelVersions.linkedin.versionId,
    p_linkedin_evaluation_id: channelVersions.linkedin.evaluationId,
    p_x_version_id: channelVersions.x.versionId,
    p_x_evaluation_id: channelVersions.x.evaluationId,
    p_newsletter_version_id: channelVersions.newsletter.versionId,
    p_newsletter_evaluation_id: channelVersions.newsletter.evaluationId,
    p_snapshot: snapshot as unknown as Json,
    p_snapshot_hash: hashCanonicalJson(snapshot),
  });

  return { requestId: request!.id, articleArtifactId: article.artifactId, packageId: (pkg as { id: string }).id };
}
