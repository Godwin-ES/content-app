-- Koya Content Studio (Week 4) — fix a missing cascade on source_set_items
--
-- Real bug found while writing Task 22's reset-test-data.ts script:
-- deleting a content_requests row cascades independently to
-- research_sources (request_id, on delete cascade) and to
-- source_set_versions -> source_set_items (cascade chain), but
-- source_set_items.source_id -> research_sources had no cascade action of
-- its own. If Postgres removes a research_sources row before the
-- source_set_items row referencing it (a real possibility across two
-- independent cascade paths from the same delete), the delete fails with
-- a foreign key violation — not just in this project's cleanup tooling,
-- but for any real deletion of a content_requests row in production
-- (e.g. an archived/rejected request being purged).

alter table source_set_items
  drop constraint source_set_items_source_id_fkey,
  add constraint source_set_items_source_id_fkey
    foreign key (source_id) references research_sources(id) on delete cascade;
