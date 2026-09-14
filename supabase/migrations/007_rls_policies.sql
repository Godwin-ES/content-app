-- Koya Content Studio (Week 4) — row level security
-- See ../../SYSTEM-DESIGN-NEXTJS.md §30 for the authoritative spec.
--
-- Business RPCs in 008 are `security definer` and therefore bypass RLS by
-- design; RLS here governs direct table access from the authenticated
-- Supabase client. Cross-table policy checks are expressed through
-- `security definer` helper functions rather than inline subqueries into
-- another RLS-protected table, which would re-trigger that table's own
-- policies and risk recursion given how these tables reference each other.

-- ---------------------------------------------------------------------------
-- helper functions
-- ---------------------------------------------------------------------------

create or replace function current_role_is(target_role text) returns boolean as $$
  select exists (select 1 from profiles where user_id = auth.uid() and role = target_role);
$$ language sql stable security definer set search_path = public;

create or replace function request_owned_by_current_user(p_request_id uuid) returns boolean as $$
  select exists (select 1 from content_requests where id = p_request_id and owner_id = auth.uid());
$$ language sql stable security definer set search_path = public;

-- A reviewer may see a request while it is pending their decision, or after
-- they have already decided one of its review cycles (so history remains
-- visible). This intentionally excludes requests still in content
-- development that have never been submitted.
create or replace function request_visible_to_current_reviewer(p_request_id uuid) returns boolean as $$
  select exists (
    select 1 from content_requests r
    where r.id = p_request_id
      and (
        r.status = 'pending_approval'
        or exists (
          select 1 from approval_reviews ar
          where ar.request_id = r.id and ar.decided_by = auth.uid()
        )
      )
  );
$$ language sql stable security definer set search_path = public;

create or replace function request_readable_by_current_user(p_request_id uuid) returns boolean as $$
  select request_owned_by_current_user(p_request_id)
    or (current_role_is('reviewer') and request_visible_to_current_reviewer(p_request_id));
$$ language sql stable security definer set search_path = public;

create or replace function artifact_request_id(p_artifact_id uuid) returns uuid as $$
  select request_id from content_artifacts where id = p_artifact_id;
$$ language sql stable security definer set search_path = public;

create or replace function artifact_version_request_id(p_artifact_version_id uuid) returns uuid as $$
  select ca.request_id
  from artifact_versions av
  join content_artifacts ca on ca.id = av.artifact_id
  where av.id = p_artifact_version_id;
$$ language sql stable security definer set search_path = public;

create or replace function source_request_id(p_source_id uuid) returns uuid as $$
  select request_id from research_sources where id = p_source_id;
$$ language sql stable security definer set search_path = public;

create or replace function package_request_id(p_package_id uuid) returns uuid as $$
  select request_id from content_packages where id = p_package_id;
$$ language sql stable security definer set search_path = public;

create or replace function queue_item_request_id(p_queue_item_id uuid) returns uuid as $$
  select request_id from publishing_queue_items where id = p_queue_item_id;
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;

create policy profiles_select_authenticated on profiles
  for select to authenticated
  using (true);

-- No client INSERT/UPDATE/DELETE policy: profile rows are created by the
-- seed/admin scripts (Task 22) using the service role key.

-- ---------------------------------------------------------------------------
-- content_requests
-- ---------------------------------------------------------------------------

alter table content_requests enable row level security;

create policy content_requests_select_readable on content_requests
  for select to authenticated
  using (request_readable_by_current_user(id));

create policy content_requests_insert_owner on content_requests
  for insert to authenticated
  with check (owner_id = auth.uid() and current_role_is('content_manager'));

-- No UPDATE/DELETE policy: workflow/content mutations go through the
-- security-definer RPCs in 008_business_rpcs.sql.

-- ---------------------------------------------------------------------------
-- supporting_materials
-- ---------------------------------------------------------------------------

alter table supporting_materials enable row level security;

create policy supporting_materials_owner_select on supporting_materials
  for select to authenticated
  using (request_owned_by_current_user(request_id));

create policy supporting_materials_owner_insert on supporting_materials
  for insert to authenticated
  with check (created_by = auth.uid() and request_owned_by_current_user(request_id));

create policy supporting_materials_owner_update on supporting_materials
  for update to authenticated
  using (request_owned_by_current_user(request_id));

create policy supporting_materials_owner_delete on supporting_materials
  for delete to authenticated
  using (request_owned_by_current_user(request_id));

-- ---------------------------------------------------------------------------
-- research_sources / source_evidence / source_review_decisions / source_conflicts
-- ---------------------------------------------------------------------------

alter table research_sources enable row level security;

create policy research_sources_select_readable on research_sources
  for select to authenticated
  using (request_readable_by_current_user(request_id));

create policy research_sources_owner_insert on research_sources
  for insert to authenticated
  with check (request_owned_by_current_user(request_id));

create policy research_sources_owner_update on research_sources
  for update to authenticated
  using (request_owned_by_current_user(request_id));

alter table source_evidence enable row level security;

create policy source_evidence_select_readable on source_evidence
  for select to authenticated
  using (request_readable_by_current_user(source_request_id(source_id)));

create policy source_evidence_owner_insert on source_evidence
  for insert to authenticated
  with check (request_owned_by_current_user(source_request_id(source_id)));

alter table source_review_decisions enable row level security;

create policy source_review_decisions_select_readable on source_review_decisions
  for select to authenticated
  using (request_readable_by_current_user(source_request_id(source_id)));

create policy source_review_decisions_owner_insert on source_review_decisions
  for insert to authenticated
  with check (decided_by = auth.uid() and request_owned_by_current_user(source_request_id(source_id)));

alter table source_conflicts enable row level security;

create policy source_conflicts_select_readable on source_conflicts
  for select to authenticated
  using (request_readable_by_current_user(request_id));

create policy source_conflicts_owner_insert on source_conflicts
  for insert to authenticated
  with check (request_owned_by_current_user(request_id));

create policy source_conflicts_owner_update on source_conflicts
  for update to authenticated
  using (request_owned_by_current_user(request_id));

-- ---------------------------------------------------------------------------
-- source_set_versions / source_set_items
--
-- No direct client INSERT: rows are only created by confirm_source_set.
-- ---------------------------------------------------------------------------

alter table source_set_versions enable row level security;

create policy source_set_versions_select_readable on source_set_versions
  for select to authenticated
  using (request_readable_by_current_user(request_id));

alter table source_set_items enable row level security;

create policy source_set_items_select_readable on source_set_items
  for select to authenticated
  using (
    exists (
      select 1 from source_set_versions ssv
      where ssv.id = source_set_version_id and request_readable_by_current_user(ssv.request_id)
    )
  );

-- ---------------------------------------------------------------------------
-- content_plans
--
-- No direct client INSERT here: plan versions are written by the planning
-- service using the owner's session, which still needs the owner-write
-- pathway below rather than an RPC (Task 11 generates a plan from an AI
-- call, not a pure state-transition, so it is not modeled as a transactional
-- business RPC in 008).
-- ---------------------------------------------------------------------------

alter table content_plans enable row level security;

create policy content_plans_select_readable on content_plans
  for select to authenticated
  using (request_readable_by_current_user(request_id));

create policy content_plans_owner_insert on content_plans
  for insert to authenticated
  with check (request_owned_by_current_user(request_id));

-- ---------------------------------------------------------------------------
-- content_artifacts / artifact_versions
--
-- No direct client INSERT/UPDATE: artifacts are created by the owner-write
-- pathway (first version) and versions are only ever created through
-- create_artifact_version.
-- ---------------------------------------------------------------------------

alter table content_artifacts enable row level security;

create policy content_artifacts_select_readable on content_artifacts
  for select to authenticated
  using (request_readable_by_current_user(request_id));

create policy content_artifacts_owner_insert on content_artifacts
  for insert to authenticated
  with check (request_owned_by_current_user(request_id));

alter table artifact_versions enable row level security;

create policy artifact_versions_select_readable on artifact_versions
  for select to authenticated
  using (request_readable_by_current_user(artifact_version_request_id(id)));

-- ---------------------------------------------------------------------------
-- evaluations
--
-- Written directly by the owner's session after an AI evaluator call
-- succeeds (Task 13), not through a state-transition RPC.
-- ---------------------------------------------------------------------------

alter table evaluations enable row level security;

create policy evaluations_select_readable on evaluations
  for select to authenticated
  using (request_readable_by_current_user(artifact_version_request_id(artifact_version_id)));

create policy evaluations_owner_insert on evaluations
  for insert to authenticated
  with check (request_owned_by_current_user(artifact_version_request_id(artifact_version_id)));

-- ---------------------------------------------------------------------------
-- content_packages / approval_reviews
--
-- No direct client INSERT/UPDATE: packages and reviews are only ever
-- created/mutated through the RPCs in 008. In particular, a Content Manager
-- can never insert an approval decision directly.
-- ---------------------------------------------------------------------------

alter table content_packages enable row level security;

create policy content_packages_select_readable on content_packages
  for select to authenticated
  using (request_readable_by_current_user(request_id));

alter table approval_reviews enable row level security;

create policy approval_reviews_select_readable on approval_reviews
  for select to authenticated
  using (request_readable_by_current_user(request_id));

-- ---------------------------------------------------------------------------
-- publishing_queue_items / publishing_events
--
-- No direct client INSERT/UPDATE: queue mutations are only ever performed
-- through create_queue_item / reschedule_queue_item / cancel_queue_item.
-- ---------------------------------------------------------------------------

alter table publishing_queue_items enable row level security;

create policy publishing_queue_items_select_readable on publishing_queue_items
  for select to authenticated
  using (request_readable_by_current_user(request_id));

alter table publishing_events enable row level security;

create policy publishing_events_select_readable on publishing_events
  for select to authenticated
  using (request_readable_by_current_user(queue_item_request_id(queue_item_id)));

-- ---------------------------------------------------------------------------
-- operation_runs / activity_events
--
-- Operational tables are not broadly client-writable (SYSTEM-DESIGN-NEXTJS.md §30.3).
-- The app writes these using the owner's session for the request they are
-- actively working (research/generation progress), but only for requests
-- they own; reviewers get read-only visibility to activity on a readable
-- request for transparency.
-- ---------------------------------------------------------------------------

alter table operation_runs enable row level security;

create policy operation_runs_select_readable on operation_runs
  for select to authenticated
  using (request_readable_by_current_user(request_id));

create policy operation_runs_owner_insert on operation_runs
  for insert to authenticated
  with check (request_owned_by_current_user(request_id));

create policy operation_runs_owner_update on operation_runs
  for update to authenticated
  using (request_owned_by_current_user(request_id));

alter table activity_events enable row level security;

create policy activity_events_select_readable on activity_events
  for select to authenticated
  using (request_readable_by_current_user(request_id));

-- No client INSERT policy: activity events are written by RPCs (security
-- definer, bypasses RLS) and by trusted server code using the service role
-- for AI-pipeline progress; never inserted directly from the browser.

-- notification_attempts / error_logs: no client policies at all. These are
-- written by trusted server code using the service role key only.

-- ---------------------------------------------------------------------------
-- storage policies
-- ---------------------------------------------------------------------------

create policy content_support_owner_all on storage.objects
  for all to authenticated
  using (bucket_id = 'content-support' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'content-support' and (storage.foldername(name))[1] = auth.uid()::text);
