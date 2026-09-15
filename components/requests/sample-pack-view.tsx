import type { SamplePack } from "@/lib/sample-pack/service";

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
          <dt className="text-muted-foreground">Audience (supplied)</dt>
          <dd>{pack.assumptions.suppliedAudience ?? "— (used default)"}</dd>
          <dt className="text-muted-foreground">Audience (resolved)</dt>
          <dd>{pack.assumptions.resolvedAudience}</dd>
          <dt className="text-muted-foreground">Objective (supplied)</dt>
          <dd>{pack.assumptions.suppliedObjective ?? "— (used default)"}</dd>
          <dt className="text-muted-foreground">Objective (resolved)</dt>
          <dd>{pack.assumptions.resolvedObjective}</dd>
          <dt className="text-muted-foreground">Tone (supplied)</dt>
          <dd>{pack.assumptions.suppliedTone ?? "— (used default)"}</dd>
          <dt className="text-muted-foreground">Tone (resolved)</dt>
          <dd>{pack.assumptions.resolvedTone}</dd>
          <dt className="text-muted-foreground">CTA (supplied)</dt>
          <dd>{pack.assumptions.suppliedCta ?? "— (used default)"}</dd>
          <dt className="text-muted-foreground">CTA (resolved)</dt>
          <dd>{pack.assumptions.resolvedCta ?? "None"}</dd>
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
        <p className="text-sm text-muted-foreground">{pack.article.metaDescription}</p>
        <div className="mt-2 whitespace-pre-wrap text-sm">{pack.article.bodyMarkdown}</div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">LinkedIn</h2>
        <p className="text-xs uppercase text-muted-foreground">Evaluation: {pack.evaluationSummary.linkedin}</p>
        <div className="mt-2 whitespace-pre-wrap text-sm">{pack.linkedin.body}</div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">X</h2>
        <p className="text-xs uppercase text-muted-foreground">Evaluation: {pack.evaluationSummary.x}</p>
        <div className="mt-2 whitespace-pre-wrap text-sm">{pack.x.body}</div>
        {pack.x.hashtags.length > 0 ? <p className="mt-1 text-sm text-muted-foreground">{pack.x.hashtags.join(" ")}</p> : null}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Newsletter</h2>
        <p className="text-xs uppercase text-muted-foreground">Evaluation: {pack.evaluationSummary.newsletter}</p>
        <h3 className="mt-2 font-medium">{pack.newsletter.subject}</h3>
        <p className="text-sm text-muted-foreground">{pack.newsletter.introduction}</p>
        <div className="mt-2 whitespace-pre-wrap text-sm">{pack.newsletter.bodyMarkdown}</div>
        <p className="mt-2 text-sm font-medium">{pack.newsletter.callToAction}</p>
        <p className="text-sm text-muted-foreground">{pack.newsletter.signoff}</p>
      </section>
    </article>
  );
}
