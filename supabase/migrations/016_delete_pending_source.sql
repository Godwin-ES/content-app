-- Koya Content Studio (Week 4) — allow removing a not-yet-researched source
-- Phase 2 of the post-Task-22 UX pass: a Content Manager can remove a
-- pending URL/material before it has been attempted. research_sources had
-- no DELETE policy at all before this; scoping it to owner + pending
-- status (rather than a full RPC) mirrors research_sources_owner_update's
-- shape, since the same "only while nothing has happened yet" rule is
-- enforced twice — here in the policy and again in
-- lib/repositories/sources.ts's deleteResearchSource, the same
-- defense-in-depth pattern used throughout this project.

create policy research_sources_owner_delete_pending on research_sources
  for delete to authenticated
  using (request_owned_by_current_user(request_id) and retrieval_status = 'pending');
