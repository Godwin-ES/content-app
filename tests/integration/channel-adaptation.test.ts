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
import { FakeAIProvider } from "@/lib/ai/providers/fake";
import type { AIProvider } from "@/lib/ai/types";
import {
  generateChannelAssets,
  regenerateChannelAsset,
  proposeChannelRevision,
  evaluateChannelVersion,
  saveManualChannelRevision,
} from "@/lib/channels/service";
import { listContentArtifacts, listArtifactVersions } from "@/lib/repositories/content";

function linkedinPost(body = "A short LinkedIn post about AI agents in recruiting.") {
  return { body, hasCallToAction: true };
}
function xPost(body = "A focused X post.") {
  return { body, hashtags: ["#hr"] };
}
function newsletterAsset(words = 300) {
  return {
    subject: "AI agents in recruiting",
    introduction: "A quick update.",
    bodyMarkdown: Array.from({ length: words }, (_, i) => `word${i}`).join(" "),
    callToAction: "Read the full article.",
    signoff: "Here's to smarter hiring.",
  };
}

function passingChannelEvaluation() {
  return {
    overallStatus: "pass" as const,
    channelFit: 5,
    certaintyInflationDetected: false,
    findings: ["Reads naturally for the platform."],
    recommendedAction: null,
  };
}

/**
 * The three channel adapters run concurrently (SYSTEM-DESIGN-NEXTJS.md
 * §21), so a single shared FIFO queue (FakeAIProvider) cannot reliably
 * target a specific channel's schema — which call reaches the provider
 * first is a genuine race, not something the test should assume. This
 * fake dispatches by inspecting the system prompt (each adapter's prompt
 * names its own channel), so each concurrent call deterministically gets
 * the response shaped for its own schema regardless of race order.
 */
function schemaAwareChannelProvider(overrides: { newsletter?: unknown } = {}): AIProvider {
  return {
    async generateStructured({ system, schema }) {
      let candidate: unknown;
      if (system.includes("LinkedIn Adapter")) candidate = linkedinPost();
      else if (system.includes("X (Twitter) Adapter")) candidate = xPost();
      else if (system.includes("Newsletter Adapter")) candidate = overrides.newsletter ?? newsletterAsset();
      else throw new Error(`Unrecognized prompt for schema-aware test provider: ${system.slice(0, 80)}`);
      return schema.parse(candidate);
    },
  };
}

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("channel adaptation (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "channels-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  async function requestWithSelectedArticle() {
    const { data: request } = await admin
      .from("content_requests")
      .insert({
        owner_id: owner.userId,
        topic: "AI agents in recruiting",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate",
        resolved_tone: "Professional",
        status: "content_development",
      })
      .select()
      .single();
    requestIds.push(request!.id);

    const { data: source } = await admin
      .from("research_sources")
      .insert({ request_id: request!.id, origin: "researched", original_url: "https://example.com/a", retrieval_status: "usable" })
      .select()
      .single();
    const { data: sourceSet } = await admin
      .from("source_set_versions")
      .insert({ request_id: request!.id, version_number: 1, confirmed_by: owner.userId })
      .select()
      .single();
    await admin.from("source_set_items").insert({ source_set_version_id: sourceSet!.id, source_id: source!.id });
    await admin.from("content_requests").update({ current_source_set_id: sourceSet!.id }).eq("id", request!.id);

    const { data: articleArtifact } = await admin
      .from("content_artifacts")
      .insert({ request_id: request!.id, kind: "article", slot: "A" })
      .select()
      .single();
    const { data: articleVersion } = await owner.client.rpc("create_artifact_version", {
      p_artifact_id: articleArtifact!.id,
      p_change_type: "initial_generation",
      p_content: {
        insufficientEvidence: false,
        insufficientEvidenceReason: null,
        title: "AI Agents in Recruiting",
        metaDescription: "meta",
        primaryKeyword: "ai agents in recruiting",
        secondaryKeywords: [],
        sections: [{ heading: "Overview", level: "h2", bodyMarkdown: "Some teams reported reduced administrative workload." }],
        links: [],
        claims: [],
      },
      p_content_hash: "hash-article",
      p_source_set_version_id: sourceSet!.id,
    });
    const articleVersionId = (articleVersion as { id: string }).id;
    await admin.from("content_requests").update({ selected_article_version_id: articleVersionId }).eq("id", request!.id);

    const { data: refreshed } = await admin.from("content_requests").select().eq("id", request!.id).single();
    return refreshed!;
  }

  it("generates all three channel assets independently from the selected article", async () => {
    const request = await requestWithSelectedArticle();
    const ai = schemaAwareChannelProvider();

    const results = await generateChannelAssets(owner.client, ai, "fake-model", request.id);
    expect(results.filter((r) => r.status === "succeeded")).toHaveLength(3);

    const artifacts = await listContentArtifacts(owner.client, request.id);
    const channelKinds = artifacts.filter((a) => a.kind !== "article").map((a) => a.kind).sort();
    expect(channelKinds).toEqual(["linkedin", "newsletter", "x"]);
  });

  it("preserves the two successful channels when the third fails, and the failed one is retryable", async () => {
    const request = await requestWithSelectedArticle();
    // Newsletter deliberately fails schema validation (missing required
    // fields); LinkedIn and X are valid.
    const ai = schemaAwareChannelProvider({ newsletter: { subject: "only a subject" } });

    const results = await generateChannelAssets(owner.client, ai, "fake-model", request.id);
    const succeeded = results.filter((r) => r.status === "succeeded");
    const failed = results.filter((r) => r.status === "failed");
    expect(succeeded).toHaveLength(2);
    expect(failed).toHaveLength(1);
    expect(failed[0].channel).toBe("newsletter");

    const artifacts = await listContentArtifacts(owner.client, request.id);
    const failedArtifact = artifacts.find((a) => a.kind === "newsletter")!;
    expect(failedArtifact.current_version_id).toBeNull();
    for (const r of succeeded) {
      const artifact = artifacts.find((a) => a.kind === r.channel)!;
      expect(artifact.current_version_id).not.toBeNull();
    }

    const retried = await regenerateChannelAsset(owner.client, new FakeAIProvider([newsletterAsset()]), "fake-model", failedArtifact.id);
    expect(retried.status).toBe("succeeded");

    const versions = await listArtifactVersions(owner.client, failedArtifact.id);
    expect(versions).toHaveLength(1);
  });

  it("computes deterministic checks and persists a passing evaluation for a channel version", async () => {
    const request = await requestWithSelectedArticle();
    await generateChannelAssets(owner.client, schemaAwareChannelProvider(), "fake-model", request.id);

    const artifacts = await listContentArtifacts(owner.client, request.id);
    const linkedinArtifact = artifacts.find((a) => a.kind === "linkedin")!;
    expect(linkedinArtifact.current_version_id).not.toBeNull();

    const evalAi = new FakeAIProvider([passingChannelEvaluation()]);
    const evaluation = await evaluateChannelVersion(owner.client, evalAi, "fake-model", linkedinArtifact.current_version_id!);
    expect(evaluation.overall_status).toBe("pass");
    const checks = evaluation.deterministic_checks as Array<{ key: string; ok: boolean }>;
    expect(checks.find((c) => c.key === "has_call_to_action")?.ok).toBe(true);
  });

  it("records certainty inflation as an unsupported claim rather than trusting overallStatus alone", async () => {
    const request = await requestWithSelectedArticle();
    await generateChannelAssets(owner.client, schemaAwareChannelProvider(), "fake-model", request.id);

    const artifacts = await listContentArtifacts(owner.client, request.id);
    const xArtifact = artifacts.find((a) => a.kind === "x")!;

    const inflatedEvaluation = { ...passingChannelEvaluation(), certaintyInflationDetected: true };
    const evalAi = new FakeAIProvider([inflatedEvaluation]);
    const evaluation = await evaluateChannelVersion(owner.client, evalAi, "fake-model", xArtifact.current_version_id!);
    const unsupported = evaluation.unsupported_claims as string[];
    expect(unsupported.length).toBeGreaterThan(0);
  });

  it("proposes a channel revision as a preview only, without persisting a new version", async () => {
    const request = await requestWithSelectedArticle();
    await generateChannelAssets(owner.client, schemaAwareChannelProvider(), "fake-model", request.id);

    const artifacts = await listContentArtifacts(owner.client, request.id);
    const linkedinArtifact = artifacts.find((a) => a.kind === "linkedin")!;
    const versionsBefore = await listArtifactVersions(owner.client, linkedinArtifact.id);

    const proposalAi = new FakeAIProvider([linkedinPost("A punchier, more direct rewrite of the post.")]);
    const proposal = await proposeChannelRevision(
      owner.client,
      proposalAi,
      "fake-model",
      linkedinArtifact.id,
      "Make it punchier."
    );
    expect((proposal as { body: string }).body).toBe("A punchier, more direct rewrite of the post.");

    const versionsAfter = await listArtifactVersions(owner.client, linkedinArtifact.id);
    expect(versionsAfter).toHaveLength(versionsBefore.length);

    const { data: artifactAfter } = await admin.from("content_artifacts").select().eq("id", linkedinArtifact.id).single();
    expect(artifactAfter!.current_version_id).toBe(linkedinArtifact.current_version_id);
  });

  it("allows an independent manual edit of one channel without touching the others", async () => {
    const request = await requestWithSelectedArticle();
    await generateChannelAssets(owner.client, schemaAwareChannelProvider(), "fake-model", request.id);

    const artifacts = await listContentArtifacts(owner.client, request.id);
    const linkedinArtifact = artifacts.find((a) => a.kind === "linkedin")!;
    const xArtifactBefore = artifacts.find((a) => a.kind === "x")!;

    const manualVersion = await saveManualChannelRevision(
      owner.client,
      linkedinArtifact.id,
      linkedinPost("A manually rewritten LinkedIn post."),
      owner.userId
    );
    expect(manualVersion.change_type).toBe("manual_edit");

    const { data: xArtifactAfter } = await admin.from("content_artifacts").select().eq("id", xArtifactBefore.id).single();
    expect(xArtifactAfter!.current_version_id).toBe(xArtifactBefore.current_version_id);
  });
});
