import type { SamplePack } from "@/lib/sample-pack/service";
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
          <AssumptionRow label="CTA" supplied={pack.assumptions.suppliedCta} resolved={pack.assumptions.resolvedCta ?? "None"} />
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Reviewed sources ({pack.reviewedSources.length})</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {pack.reviewedSources.map((source, i) => (
            <li key={i}>
              {source.title ?? source.url} {source.publisher ? `— ${source.publisher}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Article</h2>
        <p className="text-xs uppercase text-muted-foreground">Evaluation: {pack.evaluationSummary.article}</p>
        <h3 className="mt-2 font-medium">{pack.article.title}</h3>
        <p className="text-sm">{pack.article.metaDescription}</p>
        <MarkdownBody className="mt-2">{pack.article.bodyMarkdown}</MarkdownBody>
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
