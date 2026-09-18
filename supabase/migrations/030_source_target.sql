-- Koya Content Studio (Week 4) — how many pages a research run should try.
--
-- The number was a constant: 12 candidates attempted, whatever the topic.
-- That is the single biggest cost lever in the pipeline — every candidate
-- is a page fetch plus an AI analysis call — and it is also the difference
-- between a quick look and a thorough one. It belongs to the person paying
-- for it.
--
-- It counts pages *attempted*, not sources kept, because that is the honest
-- unit: some will fail to retrieve, some will turn out to be about
-- something else, and promising a number of good sources would be
-- promising something no search can guarantee.
--
-- researched_source_target records what the last run used, so raising the
-- number becomes a reason to run again — the searches go deeper and return
-- results the shallower run never saw.

alter table content_requests
  add column if not exists source_target integer not null default 12
    check (source_target between 4 and 24),
  add column if not exists researched_source_target integer null;
