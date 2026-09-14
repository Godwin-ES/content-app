import type { AIProvider } from "@/lib/ai/types";
import { researchPlanSchema, type ResearchPlan } from "@/lib/ai/schemas/research-plan";
import { sourceAnalysisSchema, type SourceAnalysis } from "@/lib/ai/schemas/source-analysis";
import { contentPlanSchema, type ContentPlan } from "@/lib/ai/schemas/content-plan";
import { articleSchema, type ArticleOutput } from "@/lib/ai/schemas/article";
import { evaluationSchema, type Evaluation } from "@/lib/ai/schemas/evaluation";
import { linkedinPostSchema, xPostSchema, newsletterSchema, channelEvaluationSchema } from "@/lib/ai/schemas/channel";
import type { LinkedinPost, XPost, Newsletter, ChannelEvaluation } from "@/lib/ai/schemas/channel";
import { buildResearchPlannerPrompt, type ResearchPlannerInput } from "@/lib/ai/prompts/research-planner";
import { buildSourceAnalyzerPrompt, type SourceAnalyzerInput } from "@/lib/ai/prompts/source-analyzer";
import { buildContentPlannerPrompt, type ContentPlannerInput } from "@/lib/ai/prompts/content-planner";
import { buildArticleWriterPrompt, type ArticleWriterInput } from "@/lib/ai/prompts/article-writer";
import { buildArticleEvaluatorPrompt, type ArticleEvaluatorInput } from "@/lib/ai/prompts/article-evaluator";
import { buildArticleReviserPrompt, type ArticleReviserInput } from "@/lib/ai/prompts/article-reviser";
import { buildLinkedinAdapterPrompt } from "@/lib/ai/prompts/linkedin-adapter";
import { buildXAdapterPrompt } from "@/lib/ai/prompts/x-adapter";
import { buildNewsletterAdapterPrompt } from "@/lib/ai/prompts/newsletter-adapter";
import type { ChannelAdapterInput } from "@/lib/ai/prompts/linkedin-adapter";
import { buildChannelEvaluatorPrompt, type ChannelEvaluatorInput } from "@/lib/ai/prompts/channel-evaluator";

/**
 * Narrow, task-specific AI operations (SYSTEM-DESIGN-NEXTJS.md §13). Each
 * takes an explicit AIProvider + modelId rather than resolving them
 * internally, so contract/unit tests can inject a FakeAIProvider and so
 * production code stays free to route different tasks to different models
 * later if benchmarking justifies it (§12.5).
 */

export async function createResearchPlan(
  provider: AIProvider,
  modelId: string,
  input: ResearchPlannerInput
): Promise<ResearchPlan> {
  const { system, user } = buildResearchPlannerPrompt(input);
  return provider.generateStructured({ modelId, system, user, schema: researchPlanSchema });
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
