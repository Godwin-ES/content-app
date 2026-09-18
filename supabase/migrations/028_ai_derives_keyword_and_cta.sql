-- Koya Content Studio (Week 4) — the keyword and the CTA are the AI's to derive.
--
-- Both were optional at intake and derived when left blank. In practice
-- the derivation was always the better answer: the content planner already
-- produces a primaryKeyword and a ctaDirection from the accepted evidence,
-- which is the only place either can be grounded. A keyword typed before
-- any research has happened is a guess about what the sources will say.
--
-- Removing the override removes a whole class of problem with it. The
-- keyword could previously disagree with the evidence, which needed a
-- coverage check to detect, a banner to report, a block on confirming, and
-- an edit-and-re-research loop to resolve. A keyword derived from the
-- accepted evidence cannot disagree with it.
--
-- The resolved_ columns stay and are now written by the planner rather than
-- by intake, so everything downstream — the article writer, the channel
-- adapters, the deterministic SEO check — reads exactly what it did before.

alter table content_requests drop column if exists supplied_primary_keyword;
alter table content_requests drop column if exists supplied_cta;

-- Existed only to notice the user had changed the keyword since the last
-- run. Nobody can change it now. What re-opens research instead is adding
-- a source, or widening the scope from supplied-only to a web search —
-- and the second of those needs remembering.
alter table content_requests drop column if exists researched_keyword;
alter table content_requests add column if not exists researched_supplied_only boolean null;

drop function if exists set_request_primary_keyword(uuid, text);
drop function if exists set_request_cta(uuid, text);
