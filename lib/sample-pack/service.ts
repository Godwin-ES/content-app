import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import type { ArticleOutput } from "@/lib/ai/schemas/article";
import type { LinkedinPost, XPost, Newsletter } from "@/lib/ai/schemas/channel";
import { getSourceSetSources } from "@/lib/repositories/sources";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];
type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];

export interface SamplePackAssumptions {
  suppliedAudience: string | null;
  resolvedAudience: string;
  suppliedObjective: string | null;
  resolvedObjective: string;
  suppliedTone: string | null;
  resolvedTone: string;
  suppliedCta: string | null;
  resolvedCta: string | null;
}

export interface SamplePackReviewedSource {
  title: string | null;
  url: string | null;
  publisher: string | null;
}

function summarizeEvaluation(evaluation: EvaluationRow | null): string {
  if (!evaluation) return "Not evaluated.";
  const unsupportedCount = Array.isArray(evaluation.unsupported_claims) ? evaluation.unsupported_claims.length : 0;
  const suffix = unsupportedCount > 0 ? ` (${unsupportedCount} unsupported claim note(s))` : "";
  return `${evaluation.overall_status}${suffix}`;
}

export interface SamplePack {
  requestId: string;
  topic: string;
  assumptions: SamplePackAssumptions;
  reviewedSources: SamplePackReviewedSource[];
  packageVersion: number;
  article: ArticleOutput;
  linkedin: LinkedinPost;
  x: XPost;
  newsletter: Newsletter;
  evaluationSummary: { article: string; linkedin: string; x: string; newsletter: string };
}

/**
 * Assembles the Week 4 sample-pack deliverable from the request's exact
 * current approved package — its pinned article/channel version content
 * and pinned evaluation IDs, not whatever happens to be "current" right
 * now (SYSTEM-DESIGN-NEXTJS.md §23, Task 21 Step 1). A request with no
 * package yet has nothing to show; callers should check for that first.
 */
export async function getSamplePack(supabase: SupabaseClient<Database>, requestId: string): Promise<SamplePack> {
  const { data: request, error: requestError } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (requestError || !request) throw requestError ?? new DomainError("NOT_FOUND", "sample_pack", "Request not found.");

  const typedRequest = request as ContentRequestRow;
  if (!typedRequest.current_package_id) {
    throw new DomainError("INVALID_STATE", "sample_pack", "This request has no package yet.");
  }

  const { data: pkg, error: pkgError } = await supabase
    .from("content_packages")
    .select()
    .eq("id", typedRequest.current_package_id)
    .single();
  if (pkgError || !pkg) throw pkgError ?? new DomainError("NOT_FOUND", "sample_pack", "Package not found.");

  const [articleVersion, linkedinVersion, xVersion, newsletterVersion] = await Promise.all(
    [pkg.article_version_id, pkg.linkedin_version_id, pkg.x_version_id, pkg.newsletter_version_id].map(async (id) => {
      const { data } = await supabase.from("artifact_versions").select().eq("id", id).single();
      return data!;
    })
  );

  const [articleEvaluation, linkedinEvaluation, xEvaluation, newsletterEvaluation] = await Promise.all(
    [pkg.article_evaluation_id, pkg.linkedin_evaluation_id, pkg.x_evaluation_id, pkg.newsletter_evaluation_id].map(async (id) => {
      const { data } = await supabase.from("evaluations").select().eq("id", id).maybeSingle();
      return data as EvaluationRow | null;
    })
  );

  const sources = await getSourceSetSources(supabase, pkg.source_set_version_id);

  return {
    requestId,
    topic: typedRequest.topic,
    assumptions: {
      suppliedAudience: typedRequest.supplied_audience,
      resolvedAudience: typedRequest.resolved_audience,
      suppliedObjective: typedRequest.supplied_objective,
      resolvedObjective: typedRequest.resolved_objective,
      suppliedTone: typedRequest.supplied_tone,
      resolvedTone: typedRequest.resolved_tone,
      suppliedCta: typedRequest.supplied_cta,
      resolvedCta: typedRequest.resolved_cta,
    },
    reviewedSources: (sources as ResearchSourceRow[]).map((s) => ({
      title: s.title,
      url: s.canonical_url ?? s.original_url,
      publisher: s.publisher,
    })),
    packageVersion: pkg.version_number,
    article: articleVersion.content as unknown as ArticleOutput,
    linkedin: linkedinVersion.content as unknown as LinkedinPost,
    x: xVersion.content as unknown as XPost,
    newsletter: newsletterVersion.content as unknown as Newsletter,
    evaluationSummary: {
      article: summarizeEvaluation(articleEvaluation),
      linkedin: summarizeEvaluation(linkedinEvaluation),
      x: summarizeEvaluation(xEvaluation),
      newsletter: summarizeEvaluation(newsletterEvaluation),
    },
  };
}
