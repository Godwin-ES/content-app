-- A research run is one thing to a person and several things to the
-- database: plan, search, retrieve, analyse each source. The workspace
-- reads operation_runs to know whether anything is happening, so the gaps
-- between those steps — searching, retrieving — read as "nothing is
-- happening" and every control in the UI unlocked mid-run. A tab returned
-- to during a search showed an idle Start research button over a research
-- run that was very much in progress.
--
-- So the pipeline gets a row of its own, open for its whole duration,
-- alongside the per-step rows that remain useful for diagnosing which step
-- was slow or failed.
alter table operation_runs drop constraint if exists operation_runs_operation_type_check;

alter table operation_runs add constraint operation_runs_operation_type_check check (
  operation_type in (
    'research_pipeline',
    'research_planning', 'web_search', 'source_retrieval', 'source_analysis',
    'content_planning', 'article_generation', 'article_evaluation', 'article_revision',
    'channel_adaptation', 'channel_evaluation', 'benchmark'
  )
);
