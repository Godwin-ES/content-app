import type { AIProvider } from "@/lib/ai/types";
import { researchPlanSchema, type ResearchPlan } from "@/lib/ai/schemas/research-plan";
import { sourceAnalysisSchema, type SourceAnalysis } from "@/lib/ai/schemas/source-analysis";
import { contentPlanSchema, contentPlanSectionSchema, type ContentPlan, type ContentPlanSection } from "@/lib/ai/schemas/content-plan";
import { articleSchema, type ArticleOutput } from "@/lib/ai/schemas/article";
import { evaluationSchema, type Evaluation } from "@/lib/ai/schemas/evaluation";
import { linkedinPostSchema, xPostSchema, newsletterSchema, channelEvaluationSchema } from "@/lib/ai/schemas/channel";
import type { LinkedinPost, XPost, Newsletter, ChannelEvaluation } from "@/lib/ai/schemas/channel";
import { buildResearchPlannerPrompt, type ResearchPlannerInput } from "@/lib/ai/prompts/research-planner";
import { buildSourceAnalyzerPrompt, type SourceAnalyzerInput } from "@/lib/ai/prompts/source-analyzer";
import { buildContentPlannerPrompt, type ContentPlannerInput } from "@/lib/ai/prompts/content-planner";
import { buildPlanSectionRegeneratePrompt, type PlanSectionRegeneratorInput } from "@/lib/ai/prompts/plan-section-regenerator";
import { buildArticleWriterPrompt, type ArticleWriterInput } from "@/lib/ai/prompts/article-writer";
import { buildArticleEvaluatorPrompt, type ArticleEvaluatorInput } from "@/lib/ai/prompts/article-evaluator";
import { buildArticleReviserPrompt, type ArticleReviserInput } from "@/lib/ai/prompts/article-reviser";
import { buildLinkedinAdapterPrompt } from "@/lib/ai/prompts/linkedin-adapter";
import { buildXAdapterPrompt } from "@/lib/ai/prompts/x-adapter";
import { buildNewsletterAdapterPrompt } from "@/lib/ai/prompts/newsletter-adapter";
import type { ChannelAdapterInput } from "@/lib/ai/prompts/linkedin-adapter";
import { buildChannelEvaluatorPrompt, type ChannelEvaluatorInput } from "@/lib/ai/prompts/channel-evaluator";
import { textCoversKeyword } from "@/lib/domain/keyword";
import { DomainError } from "@/lib/domain/errors";
import { buildIntakeReviewerPrompt, type IntakeReviewerInput } from "@/lib/ai/prompts/intake-reviewer";
import { intakeReviewSchema, type IntakeReview } from "@/lib/ai/schemas/intake-review";

/**
 * Narrow, task-specific AI operations (SYSTEM-DESIGN-NEXTJS.md §13). Each
 * takes an explicit AIProvider + modelId rather than resolving them
 * internally, so contract/unit tests can inject a FakeAIProvider and so
 * production code stays free to route different tasks to different models
 * later if benchmarking justifies it (§12.5).
 */

/**
 * How many times a plan may be re-asked for before its keyword/query
 * mismatch is treated as a real failure. Non-deterministic output usually
 * satisfies the rule on a second attempt, and asking twice is far cheaper
 * than researching against a keyword nothing searched for.
 */
const RESEARCH_PLAN_ATTEMPTS = 3;

export async function createResearchPlan(
  provider: AIProvider,
  modelId: string,
  input: ResearchPlannerInput
): Promise<ResearchPlan> {
  const { system, user } = buildResearchPlannerPrompt(input);

  let lastPlan: ResearchPlan | null = null;
  for (let attempt = 1; attempt <= RESEARCH_PLAN_ATTEMPTS; attempt++) {
    const plan = await provider.generateStructured({ modelId, system, user, schema: researchPlanSchema });
    lastPlan = plan;

    // The schema can only say these fields are present, not that they
    // agree. Without this the planner was free to emit a keyword and a set
    // of queries with nothing in common — and since only the queries are
    // ever searched, the keyword became a label rather than a constraint,
    // discovered later by the coverage check or, later still, by the SEO
    // check on the finished article.
    if (plan.searchQueries.some((query) => textCoversKeyword(query, plan.primaryKeyword))) {
      return plan;
    }
  }

  throw new DomainError(
    "VALIDATION_ERROR",
    "research_planning",
    `The research plan kept searching for something other than its own primary keyword ("${lastPlan?.primaryKeyword ?? ""}"). ` +
      "Try a more specific topic, or set the primary keyword yourself."
  );
}

export async function analyzeSource(
  provider: AIProvider,
  modelId: string,
  input: SourceAnalyzerInput
): Promise<SourceAnalysis> {
  const { system, user } = buildSourceAnalyzerPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: sourceAnalysisSchema });
}

export async function createContentPlan(
  provider: AIProvider,
  modelId: string,
  input: ContentPlannerInput
): Promise<ContentPlan> {
  const { system, user } = buildContentPlannerPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: contentPlanSchema });
}

export async function regeneratePlanSection(
  provider: AIProvider,
  modelId: string,
  input: PlanSectionRegeneratorInput
): Promise<ContentPlanSection> {
  const { system, user } = buildPlanSectionRegeneratePrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: contentPlanSectionSchema });
}

export async function generateArticle(
  provider: AIProvider,
  modelId: string,
  input: ArticleWriterInput
): Promise<ArticleOutput> {
  const { system, user } = buildArticleWriterPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: articleSchema });
}

export async function evaluateArticle(
  provider: AIProvider,
  modelId: string,
  input: ArticleEvaluatorInput
): Promise<Evaluation> {
  const { system, user } = buildArticleEvaluatorPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: evaluationSchema });
}

export async function reviseArticle(
  provider: AIProvider,
  modelId: string,
  input: ArticleReviserInput
): Promise<ArticleOutput> {
  const { system, user } = buildArticleReviserPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: articleSchema });
}

export async function adaptLinkedIn(provider: AIProvider, modelId: string, input: ChannelAdapterInput): Promise<LinkedinPost> {
  const { system, user } = buildLinkedinAdapterPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: linkedinPostSchema });
}

export async function adaptX(provider: AIProvider, modelId: string, input: ChannelAdapterInput): Promise<XPost> {
  const { system, user } = buildXAdapterPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: xPostSchema });
}

export async function adaptNewsletter(provider: AIProvider, modelId: string, input: ChannelAdapterInput): Promise<Newsletter> {
  const { system, user } = buildNewsletterAdapterPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: newsletterSchema });
}

export async function evaluateChannel(
  provider: AIProvider,
  modelId: string,
  input: ChannelEvaluatorInput
): Promise<ChannelEvaluation> {
  const { system, user } = buildChannelEvaluatorPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: channelEvaluationSchema });
}

/**
 * Reviews a whole intake in one call. See buildIntakeReviewerPrompt for
 * why it is one call and why the bar is deliberately low.
 */
export async function reviewIntake(
  provider: AIProvider,
  modelId: string,
  input: IntakeReviewerInput
): Promise<IntakeReview> {
  const { system, user } = buildIntakeReviewerPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: intakeReviewSchema });
}
