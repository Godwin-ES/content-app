import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import type { SamplePack, SamplePackReviewedSource } from "@/lib/sample-pack/service";
import { articleBodyMarkdown } from "@/lib/ai/schemas/article";
import { MarkdownBody } from "@/components/shared/markdown-body";
import { ArticleCard, ExpandableText, EvaluationVerdict } from "@/components/requests/sample-pack-section";
import { LocalDateTime } from "@/components/shared/local-date-time";

/**
 * The finished package: the request, its resolved assumptions, the sources
 * it was written from, and the exact packaged article and channel assets
 * with the evaluation that cleared each one
 * (SYSTEM-DESIGN-NEXTJS.md §23, Task 21).
 *
 * Two shapes, one source of truth. `interactive` is the Package tab: every
 * deliverable collapses to a heading, a verdict you can click for its
 * findings, and a short gist, so the tab answers "is this ready?" without
 * making you scroll four documents. Without it this is the printable pack,
 * where nothing is hidden because paper has no disclosure — the browser's
 * own print/export is the whole PDF story, no generation dependency.
 */
export function SamplePackView({ pack, interactive = false }: { pack: SamplePack; interactive?: boolean }) {
  return (
    <article className={interactive ? "flex flex-col gap-6" : "mx-auto flex max-w-3xl flex-col gap-8 p-8 print:p-0"}>
      {interactive ? (
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">Package v{pack.packageVersion}</span>
          <span className="text-muted-foreground">
            created <LocalDateTime value={pack.packageCreatedAt} />
          </span>
        </div>
      ) : (
        <header className="flex flex-col gap-1 border-b pb-4">
          <h1 className="text-2xl font-semibold">{pack.topic}</h1>
          <p className="text-sm text-muted-foreground">Sample pack · Package v{pack.packageVersion}</p>
        </header>
      )}

      <section>
        <h2 className="mb-2 text-lg font-medium">Request &amp; resolved assumptions</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <AssumptionRow label="Audience" supplied={pack.assumptions.suppliedAudience} resolved={pack.assumptions.resolvedAudience} />
          <AssumptionRow label="Objective" supplied={pack.assumptions.suppliedObjective} resolved={pack.assumptions.resolvedObjective} />
          <AssumptionRow label="Tone" supplied={pack.assumptions.suppliedTone} resolved={pack.assumptions.resolvedTone} />
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Reviewed sources ({pack.reviewedSources.length})</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {pack.reviewedSources.map((source, i) => (
            <li key={i} className="flex flex-col">
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group w-fit rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="flex items-center gap-1.5 font-medium group-hover:underline">
                    {source.title ?? source.url}
                    <ExternalLink aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  </span>
                  <span className="block text-xs break-all text-muted-foreground group-hover:underline">{source.url}</span>
                </a>
              ) : (
                <>
                  <span className="font-medium">{source.title ?? "Untitled source"}</span>
                  <span className="text-xs text-muted-foreground">{ORIGIN_LABEL[source.origin]}</span>
                </>
              )}
              {source.url && source.publisher ? <span className="text-xs text-muted-foreground">{source.publisher}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      {interactive ? (
        <div className="flex flex-col gap-4">
          <ArticleCard
            status={pack.evaluationSummary.article}
            evaluation={pack.evaluations.article}
            title={pack.article.title}
            metaDescription={pack.article.metaDescription}
            bodyMarkdown={articleBodyMarkdown(pack.article)}
          />

          <ChannelCard label="LinkedIn" status={pack.evaluationSummary.linkedin} evaluation={pack.evaluations.linkedin}>
            <ExpandableText text={pack.linkedin.body} />
          </ChannelCard>

          <ChannelCard label="X" status={pack.evaluationSummary.x} evaluation={pack.evaluations.x}>
            <ExpandableText text={pack.x.body} />
            {pack.x.hashtags.length > 0 ? <p className="text-sm text-muted-foreground">{pack.x.hashtags.join(" ")}</p> : null}
          </ChannelCard>

          <ChannelCard label="Newsletter" status={pack.evaluationSummary.newsletter} evaluation={pack.evaluations.newsletter}>
            <p className="font-medium">{pack.newsletter.subject}</p>
            <p className="text-sm">{pack.newsletter.introduction}</p>
            <ExpandableText text={pack.newsletter.bodyMarkdown} markdown />
            <p className="text-sm font-medium">{pack.newsletter.callToAction}</p>
            <p className="text-sm">{pack.newsletter.signoff}</p>
          </ChannelCard>
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-lg font-medium">Article</h2>
            <p className="text-xs text-muted-foreground uppercase">Evaluation: {pack.evaluationSummary.article}</p>
            <h3 className="mt-2 font-medium">{pack.article.title}</h3>
            <p className="text-sm">{pack.article.metaDescription}</p>
            <MarkdownBody className="mt-2">{articleBodyMarkdown(pack.article)}</MarkdownBody>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">LinkedIn</h2>
            <p className="text-xs text-muted-foreground uppercase">Evaluation: {pack.evaluationSummary.linkedin}</p>
            <MarkdownBody className="mt-2">{pack.linkedin.body}</MarkdownBody>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">X</h2>
            <p className="text-xs text-muted-foreground uppercase">Evaluation: {pack.evaluationSummary.x}</p>
            <MarkdownBody className="mt-2">{pack.x.body}</MarkdownBody>
            {pack.x.hashtags.length > 0 ? <p className="mt-1 text-sm text-muted-foreground">{pack.x.hashtags.join(" ")}</p> : null}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-medium">Newsletter</h2>
            <p className="text-xs text-muted-foreground uppercase">Evaluation: {pack.evaluationSummary.newsletter}</p>
            <h3 className="mt-2 font-medium">{pack.newsletter.subject}</h3>
            <p className="text-sm">{pack.newsletter.introduction}</p>
            <MarkdownBody className="mt-2">{pack.newsletter.bodyMarkdown}</MarkdownBody>
            <p className="mt-2 text-sm font-medium">{pack.newsletter.callToAction}</p>
            <p className="text-sm">{pack.newsletter.signoff}</p>
          </section>
        </>
      )}
    </article>
  );
}

/**
 * A channel asset's card. Unlike the article there is no gist to show above
 * the fold — the post *is* the gist — so the body sits open and truncates
 * itself only when it is genuinely long.
 */
function ChannelCard({
  label,
  status,
  evaluation,
  children,
}: {
  label: string;
  status: string;
  evaluation: SamplePack["evaluations"]["linkedin"];
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
        <EvaluationVerdict status={status} evaluation={evaluation} />
      </div>
      {children}
    </section>
  );
}

const ORIGIN_LABEL: Record<SamplePackReviewedSource["origin"], string> = {
  researched: "Found by research",
  user_url: "Provided by Content Manager",
  uploaded_material: "Uploaded by Content Manager",
};

/**
 * One row per field instead of a separate supplied/resolved pair — still
 * satisfies "the UI must show which values were supplied and which were
 * resolved from defaults" (SYSTEM-DESIGN-NEXTJS.md §7.3), just without
 * showing both when only one actually applies.
 */
function AssumptionRow({ label, supplied, resolved }: { label: string; supplied: string | null; resolved: string }) {
  return (
    <>
      <dt className="text-muted-foreground">
        {label} ({supplied ? "supplied" : "default"})
      </dt>
      <dd>{supplied ?? resolved}</dd>
    </>
  );
}
