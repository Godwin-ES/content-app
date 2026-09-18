-- Koya Content Studio (Week 4) — remember which keyword the research ran for.
--
-- The primary keyword became editable on the Research tab, but research
-- itself could only ever run once: startResearchAction refused unless the
-- request was still a draft, and research is what moves it past draft. So
-- changing the keyword afterwards changed what the plan and article were
-- written against while the sources stayed whatever the first run found —
-- exactly the mismatch the coverage check reports, with no way to act on it.
--
-- Re-running needs one fact the database did not hold: what the last run
-- actually searched for. With it, "re-run research" can be offered
-- precisely when it would do something different, rather than inviting
-- someone to spend a pipeline re-fetching the same pages.

alter table content_requests add column if not exists researched_keyword text null;
