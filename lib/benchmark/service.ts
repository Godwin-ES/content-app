import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AIProvider } from "@/lib/ai/types";
import type { ContentPlan } from "@/lib/ai/schemas/content-plan";
import type { EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";
import { articleBodyMarkdown, type ArticleOutput } from "@/lib/ai/schemas/article";
import type { Evaluation } from "@/lib/ai/schemas/evaluation";
import type { LinkedinPost, ChannelEvaluation } from "@/lib/ai/schemas/channel";
import { generateArticle, evaluateArticle, reviseArticle, adaptLinkedIn, evaluateChannel } from "@/lib/ai/service";
import { validateArticleSEO, type SeoCheckResult } from "@/lib/seo/validate";
import { validateLinkedinPost } from "@/lib/channels/validate";
import { getErrorMessage } from "@/lib/domain/errors";

export interface BenchmarkScenario {
  key: string;
  label: string;
  description: string;
  audience: string;
  objective: string;
  tone: string;
  cta: string | null;
  plan: ContentPlan;
  evidencePackets: EvidencePacketInput[];
  validEvidenceIds: string[];
}

const SCENARIO_KEYS = ["well_sourced", "thin_evidence", "conflicting_sources", "prompt_injection", "seo_pressure", "channel_compression"];

/**
 * Loads the frozen benchmark scenarios (SYSTEM-DESIGN-NEXTJS.md §40) — the
 * same fixed input run independently through each candidate model, so
 * comparisons reflect actual behavior differences rather than one lucky
 * or unlucky article.
 */
export async function loadBenchmarkScenarios(): Promise<BenchmarkScenario[]> {
  const dir = path.join(process.cwd(), "tests", "fixtures", "benchmark");
  return Promise.all(
    SCENARIO_KEYS.map(async (key) => {
      const raw = await readFile(path.join(dir, `${key}.json`), "utf-8");
      return JSON.parse(raw) as BenchmarkScenario;
    })
  );
}

export interface BenchmarkStepResult<T> {
  ok: boolean;
  value: T | null;
  error: string | null;
}

export interface BenchmarkRunResult {
  scenarioKey: string;
  article: BenchmarkStepResult<ArticleOutput>;
  deterministicChecks: SeoCheckResult[];
  claimsWithoutEvidence: string[];
  evaluation: BenchmarkStepResult<Evaluation>;
  revisedArticle: BenchmarkStepResult<ArticleOutput> | null;
  linkedinPost: BenchmarkStepResult<LinkedinPost>;
  linkedinChecks: ReturnType<typeof validateLinkedinPost>;
  channelEvaluation: BenchmarkStepResult<ChannelEvaluation>;
}

function step<T>(value: T): BenchmarkStepResult<T> {
  return { ok: true, value, error: null };
}
function stepError<T>(error: unknown): BenchmarkStepResult<T> {
  return { ok: false, value: null, error: getErrorMessage(error) };
}

/**
 * Runs one frozen scenario through one model end to end (write, evaluate,
 * revise-if-needed, adapt one channel, evaluate that channel), recording
 * everything the plan's comparison table needs (SYSTEM-DESIGN-NEXTJS.md
 * §40): schema reliability, grounding accuracy, evidence restraint,
 * evaluator usefulness, revision success, and channel certainty
 * preservation. Never persists to the real business tables — this is an
 * ephemeral, tester-facing comparison, not request/article data.
 */
export async function runBenchmarkScenario(ai: AIProvider, modelId: string, scenario: BenchmarkScenario): Promise<BenchmarkRunResult> {
  let article: ArticleOutput | null = null;
  let articleResult: BenchmarkStepResult<ArticleOutput>;
  try {
    article = await generateArticle(ai, modelId, {
      angle: "practical",
      audience: scenario.audience,
      objective: scenario.objective,
      tone: scenario.tone,
      cta: scenario.cta,
      plan: scenario.plan,
      evidencePackets: scenario.evidencePackets,
    });
    articleResult = step(article);
  } catch (error) {
    articleResult = stepError(error);
  }

  const deterministicChecks = article
    ? validateArticleSEO({ title: article.title, primaryKeyword: scenario.plan.primaryKeyword, bodyMarkdown: articleBodyMarkdown(article), links: article.links })
    : [];

  const validEvidenceIds = new Set(scenario.validEvidenceIds);
  const claimsWithoutEvidence = (article?.claims ?? [])
    .filter((c) => c.claimType !== "editorial")
    .filter((c) => c.evidenceIds.length === 0 || c.evidenceIds.some((id) => !validEvidenceIds.has(id)))
    .map((c) => c.claimText);

  let evaluation: Evaluation | null = null;
  let evaluationResult: BenchmarkStepResult<Evaluation>;
  if (article) {
    try {
      evaluation = await evaluateArticle(ai, modelId, {
        audience: scenario.audience,
        objective: scenario.objective,
        tone: scenario.tone,
        article,
        evidencePackets: scenario.evidencePackets,
      });
      evaluationResult = step(evaluation);
    } catch (error) {
      evaluationResult = stepError(error);
    }
  } else {
    evaluationResult = { ok: false, value: null, error: "Skipped: article generation failed." };
  }

  let revisedArticle: ArticleOutput | null = null;
  let revisedResult: BenchmarkStepResult<ArticleOutput> | null = null;
  if (article && evaluation?.overallStatus === "revise") {
    try {
      revisedArticle = await reviseArticle(ai, modelId, { article, evaluation, evidencePackets: scenario.evidencePackets });
      revisedResult = step(revisedArticle);
    } catch (error) {
      revisedResult = stepError(error);
    }
  }

  const articleForChannel = revisedArticle ?? article;
  let linkedinPost: LinkedinPost | null = null;
  let linkedinResult: BenchmarkStepResult<LinkedinPost>;
  if (articleForChannel) {
    try {
      linkedinPost = await adaptLinkedIn(ai, modelId, {
        audience: scenario.audience,
        tone: scenario.tone,
        cta: scenario.cta,
        articleTitle: articleForChannel.title,
        articleBodyMarkdown: articleBodyMarkdown(articleForChannel),
      });
      linkedinResult = step(linkedinPost);
    } catch (error) {
      linkedinResult = stepError(error);
    }
  } else {
    linkedinResult = { ok: false, value: null, error: "Skipped: no article available to adapt." };
  }

  const linkedinChecks = linkedinPost ? validateLinkedinPost(linkedinPost) : [];

  let channelEvaluationResult: BenchmarkStepResult<ChannelEvaluation>;
  if (linkedinPost && articleForChannel) {
    try {
      const channelEvaluation = await evaluateChannel(ai, modelId, {
        channel: "linkedin",
        articleBodyMarkdown: articleBodyMarkdown(articleForChannel),
        channelOutputText: linkedinPost.body,
      });
      channelEvaluationResult = step(channelEvaluation);
    } catch (error) {
      channelEvaluationResult = stepError(error);
    }
  } else {
    channelEvaluationResult = { ok: false, value: null, error: "Skipped: no LinkedIn post available to evaluate." };
  }

  return {
    scenarioKey: scenario.key,
    article: articleResult,
    deterministicChecks,
    claimsWithoutEvidence,
    evaluation: evaluationResult,
    revisedArticle: revisedResult,
    linkedinPost: linkedinResult,
    linkedinChecks,
    channelEvaluation: channelEvaluationResult,
  };
}
