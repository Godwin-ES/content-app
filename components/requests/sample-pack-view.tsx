import { ExternalLink } from "lucide-react";
import type { SamplePack, SamplePackReviewedSource } from "@/lib/sample-pack/service";
import { articleBodyMarkdown } from "@/lib/ai/schemas/article";
import { MarkdownBody } from "@/components/shared/markdown-body";

/**
 * Printable sample-pack view (SYSTEM-DESIGN-NEXTJS.md, Task 21 Step 2): a
 * clean browser print/export is sufficient for the Week 4 content sample
 * deliverable — no PDF-generation dependency. Shows the request, resolved
 * assumptions, reviewed sources, and the exact packaged article/channel
 * content plus a concise evaluation summary for each.
 */
export function SamplePackView({ pack }: { pack: SamplePack }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 p-8 print:p-0">
      <header className="flex flex-col gap-1 border-b pb-4">
        <h1 className="text-2xl font-semibold">{pack.topic}</h1>
        <p className="text-sm text-muted-foreground">Sample pack · Package v{pack.packageVersion}</p>
      </header>

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

      <section>
        <h2 className="mb-2 text-lg font-medium">Article</h2>
        <p className="text-xs uppercase text-muted-foreground">Evaluation: {pack.evaluationSummary.article}</p>
        <h3 className="mt-2 font-medium">{pack.article.title}</h3>
        <p className="text-sm">{pack.article.metaDescription}</p>
        <MarkdownBody className="mt-2">{articleBodyMarkdown(pack.article)}</MarkdownBody>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">LinkedIn</h2>
        <p className="text-xs uppercase text-muted-foreground">Evaluation: {pack.evaluationSummary.linkedin}</p>
        <MarkdownBody className="mt-2">{pack.linkedin.body}</MarkdownBody>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">X</h2>
        <p className="text-xs uppercase text-muted-foreground">Evaluation: {pack.evaluationSummary.x}</p>
        <MarkdownBody className="mt-2">{pack.x.body}</MarkdownBody>
        {pack.x.hashtags.length > 0 ? <p className="mt-1 text-sm text-muted-foreground">{pack.x.hashtags.join(" ")}</p> : null}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Newsletter</h2>
        <p className="text-xs uppercase text-muted-foreground">Evaluation: {pack.evaluationSummary.newsletter}</p>
        <h3 className="mt-2 font-medium">{pack.newsletter.subject}</h3>
        <p className="text-sm">{pack.newsletter.introduction}</p>
        <MarkdownBody className="mt-2">{pack.newsletter.bodyMarkdown}</MarkdownBody>
        <p className="mt-2 text-sm font-medium">{pack.newsletter.callToAction}</p>
        <p className="text-sm">{pack.newsletter.signoff}</p>
      </section>
    </article>
  );
}

/**
 * One row per field instead of a separate supplied/resolved pair — still
 * satisfies "the UI must show which values were supplied and which were
 * resolved from defaults" (SYSTEM-DESIGN-NEXTJS.md §7.3), just without
 * showing both when only one actually applies.
 */
const ORIGIN_LABEL: Record<SamplePackReviewedSource["origin"], string> = {
  researched: "Found by research",
  user_url: "Provided by Content Manager",
  uploaded_material: "Uploaded by Content Manager",
};

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
