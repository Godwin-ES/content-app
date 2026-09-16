-- When true, research skips AI-generated web search entirely and only
-- retrieves the Content Manager's own supplied URLs/materials (Phase 1 of
-- the post-Task-22 UX pass: "only use supplied materials" intake option).
alter table content_requests
  add column supplied_sources_only boolean not null default false;
