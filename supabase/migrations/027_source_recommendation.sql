-- Koya Content Studio (Week 4) — the analyzer's own view of each source.
--
-- Source review asked a question the app had not answered: keep this one,
-- or not? Retrieval status only says whether a page could be read and
-- whether any evidence came out of it, which is a different question from
-- whether that evidence has anything to do with the topic. A page that
-- reads perfectly and is about something else is "usable" and useless.
--
-- That judgement is already being made — the analyzer reads every source
-- against the topic and the research questions to pull evidence out of it.
-- It just was not being written down. Recording it costs no extra AI call
-- and gives both a recommendation on screen and something for auto mode to
-- act on, rather than accepting whatever retrieved.
--
-- It stays a recommendation. The decision is still source_review_decisions,
-- made by a person (or by auto mode on their behalf), and it can disagree.

alter table research_sources
  add column if not exists recommendation text null
    check (recommendation is null or recommendation in ('accept', 'exclude')),
  add column if not exists recommendation_reason text null;
