-- Koya Content Studio (Week 4) — the review workflow goes; the bin arrives.
--
-- 020 removed the second person. This removes the ceremony that only ever
-- existed for them. With one account, "submit for approval" meant handing
-- the package to yourself, "awaiting approval" meant waiting for yourself,
-- and "request changes" meant writing yourself a note about work you were
-- about to do anyway. Three statuses, three dashboard tabs, and a whole
-- decision RPC existed to move a package between one person's hands.
--
-- What survives is the thing the brief actually asks for: a human looks at
-- a specific package version and approves it before anything can be
-- queued. That is now one act, recorded once, in package_approvals.
--
-- In its place, the deletion the product was missing. Deleting used to be
-- permanent and was therefore hedged about with rules — refused once a
-- Reviewer had responded, replaced by "withdraw" while a package was out.
-- With no Reviewer there is nothing to protect, so deletion becomes a bin:
-- reversible for 30 days, permanent after.

-- ---------------------------------------------------------------------------
-- content_requests: a deleted_at, and two fewer statuses
-- ---------------------------------------------------------------------------

alter table content_requests add column if not exists deleted_at timestamptz null;

-- Every dashboard query filters on owner + deleted_at, so they belong in
-- one index together.
create index if not exists content_requests_owner_deleted_idx
  on content_requests (owner_id, deleted_at);

-- Anything mid-approval is simply in progress again: it was never approved,
-- and the state it was sitting in no longer exists.
update content_requests
set status = 'content_development'
where status in ('pending_approval', 'changes_requested');

alter table content_requests drop constraint if exists content_requests_status_check;
alter table content_requests add constraint content_requests_status_check check (
  status in ('draft', 'source_review', 'content_development', 'approved', 'archived')
);

-- ---------------------------------------------------------------------------
-- approval_reviews -> package_approvals
--
-- The table was shaped around a conversation: submitted by one person,
-- decided by another, possibly withdrawn, possibly sent back with a
-- comment. None of that has a second party any more. What is left is the
-- fact worth keeping — this exact package version was approved, by this
-- person, at this time — which is the evidence the gate was honoured.
-- ---------------------------------------------------------------------------

drop function if exists submit_package_for_review(uuid, uuid);
drop function if exists withdraw_package_review(uuid);
drop function if exists decide_package_review(uuid, uuid, text, text);

-- A pending or withdrawn row recorded a submission that was never decided;
-- a changes_requested row recorded a note to oneself. Neither is an
-- approval, and neither has a column to live in any more.
delete from approval_reviews where status <> 'approved';

drop policy if exists approval_reviews_select_readable on approval_reviews;
drop index if exists approval_reviews_one_pending_per_request;
drop index if exists approval_reviews_request_id_idx;
drop index if exists approval_reviews_package_id_idx;

alter table approval_reviews rename to package_approvals;

alter table package_approvals drop column status;
alter table package_approvals drop column comment;
alter table package_approvals drop column submitted_by;
alter table package_approvals drop column submitted_at;
alter table package_approvals rename column decided_by to approved_by;
alter table package_approvals rename column decided_at to approved_at;

-- Now that a row only ever means "approved", neither column can be null.
alter table package_approvals alter column approved_by set not null;
alter table package_approvals alter column approved_at set not null;
alter table package_approvals alter column approved_at set default now();

-- created_at and approved_at were written at the same instant on a row
-- that only ever means one thing. One timestamp is enough.
alter table package_approvals drop column created_at;

create index package_approvals_request_id_idx on package_approvals (request_id, approved_at desc);
create index package_approvals_package_id_idx on package_approvals (package_id);

-- One approval per package version. Re-approving the same package is a
-- double-click, not a second decision.
create unique index package_approvals_one_per_package on package_approvals (package_id);

create policy package_approvals_select_readable on package_approvals
  for select to authenticated
  using (request_readable_by_current_user(request_id));

-- ---------------------------------------------------------------------------
-- approve_package
--
-- Replaces submit -> decide. One call, one row, one status change, and the
-- same guards the two-step version enforced between them: you own it, it
-- is still in development, and the package you are approving is still the
-- request's current one.
-- ---------------------------------------------------------------------------

create or replace function approve_package(p_request_id uuid, p_package_id uuid)
returns package_approvals as $$
declare
  v_request content_requests;
  v_approval package_approvals;
begin
  select * into v_request from content_requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id;
  end if;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_request.deleted_at is not null then
    raise exception 'INVALID_STATE: this request is in the bin — restore it first';
  end if;

  if v_request.status <> 'content_development' then
    raise exception 'INVALID_STATE: this request is not ready to approve (status: %)', v_request.status;
  end if;

  if v_request.current_package_id is distinct from p_package_id then
    raise exception 'STALE_VERSION: package is no longer the request''s current package';
  end if;

  insert into package_approvals (request_id, package_id, approved_by)
  values (p_request_id, p_package_id, auth.uid())
  returning * into v_approval;

  update content_requests set status = 'approved' where id = p_request_id;

  insert into activity_events (request_id, event_type, message, actor_id, metadata)
  values (p_request_id, 'package_approved', 'Package approved for publishing', auth.uid(),
    jsonb_build_object('packageId', p_package_id, 'approvalId', v_approval.id));

  return v_approval;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Deleting is now reversible
--
-- purge_request holds what delete_request used to do. The order matters:
-- several provenance FKs deliberately do not cascade, so dependants have to
-- go first.
--
-- It also fixes a real bug in the old ordering. source_evidence references
-- operation_runs (004_operations_activity_errors.sql), and the old function
-- deleted operation_runs while evidence rows still pointed at them — so
-- deleting any request that had actually been researched failed on a
-- foreign-key violation. It went unnoticed because the integration fixture
-- seeds sources without evidence.
-- ---------------------------------------------------------------------------

create or replace function purge_request(p_request_id uuid) returns void as $$
begin
  -- Forward pointers first: these reference rows that are about to go.
  update content_requests
  set current_package_id = null,
      current_plan_id = null,
      selected_article_version_id = null,
      current_source_set_id = null
  where id = p_request_id;

  update content_artifacts set current_version_id = null where request_id = p_request_id;

  delete from publishing_queue_items where request_id = p_request_id;
  delete from package_approvals where request_id = p_request_id;
  delete from content_packages where request_id = p_request_id;

  delete from evaluations
  where artifact_version_id in (
    select av.id from artifact_versions av
    join content_artifacts ca on ca.id = av.artifact_id
    where ca.request_id = p_request_id
  );

  -- Before operation_runs, which it references.
  delete from source_evidence
  where source_id in (select id from research_sources where request_id = p_request_id);

  delete from operation_runs where request_id = p_request_id;

  delete from artifact_versions
  where artifact_id in (select id from content_artifacts where request_id = p_request_id);

  delete from content_artifacts where request_id = p_request_id;
  delete from content_plans where request_id = p_request_id;

  -- Everything still standing (research_sources, source_review_decisions,
  -- source_set_versions, supporting_materials, activity_events, error_logs,
  -- notification_attempts) cascades from content_requests once the
  -- non-cascading references above are gone.
  delete from content_requests where id = p_request_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function purge_request(uuid) from public, anon, authenticated;

/**
 * How long a deleted request can be restored. Kept as a function rather
 * than a literal repeated in four places, so the promise the UI makes and
 * the rule the database enforces cannot drift apart.
 */
create or replace function deleted_request_retention() returns interval as $$
  select interval '30 days';
$$ language sql immutable;

-- Sweeps anything past the retention window. Called from delete and
-- restore, so the bin cleans itself whenever it is used. A deployment with
-- pg_cron available should schedule this directly as well; the listing
-- filters on the same window either way, so the UI never offers a restore
-- it cannot honour, whether or not a row has physically gone yet.
create or replace function purge_expired_requests() returns integer as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from content_requests
    where deleted_at is not null
      and deleted_at < now() - deleted_request_retention()
  loop
    perform purge_request(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function purge_expired_requests() from public, anon;
grant execute on function purge_expired_requests() to authenticated;

-- Soft delete. Allowed at any point in a request's life, including after
-- approval: it is reversible, so there is nothing left to protect it from.
-- Queued publishing items are cancelled, because a request in the bin must
-- not keep a place in the queue.
create or replace function delete_request(p_request_id uuid) returns void as $$
declare
  v_request content_requests;
begin
  perform purge_expired_requests();

  select * into v_request from content_requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id;
  end if;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_request.deleted_at is not null then
    return;
  end if;

  update publishing_queue_items
  set status = 'cancelled'
  where request_id = p_request_id and status <> 'cancelled';

  update content_requests set deleted_at = now() where id = p_request_id;

  insert into activity_events (request_id, event_type, message, actor_id)
  values (p_request_id, 'request_deleted', 'Request moved to the bin', auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function delete_request(uuid) from public, anon;
grant execute on function delete_request(uuid) to authenticated;

-- Restores a request from the bin, if it is still inside the window.
-- Cancelled queue items are deliberately NOT un-cancelled: whether the
-- content should go out again is a decision, not a side effect of undoing
-- a delete.
create or replace function restore_request(p_request_id uuid) returns content_requests as $$
declare
  v_request content_requests;
begin
  perform purge_expired_requests();

  select * into v_request from content_requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'NOT_FOUND: this request no longer exists';
  end if;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_request.deleted_at is null then
    return v_request;
  end if;

  update content_requests set deleted_at = null where id = p_request_id
  returning * into v_request;

  insert into activity_events (request_id, event_type, message, actor_id)
  values (p_request_id, 'request_restored', 'Request restored from the bin', auth.uid());

  return v_request;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function restore_request(uuid) from public, anon;
grant execute on function restore_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Last traces of the second role
-- ---------------------------------------------------------------------------

-- 019 let these run while a request was in 'changes_requested'. There is no
-- such status now, and a request in the bin should not be edited at all.
create or replace function set_request_primary_keyword(p_request_id uuid, p_primary_keyword text)
returns content_requests as $$
declare
  v_request content_requests;
  v_value text := nullif(btrim(coalesce(p_primary_keyword, '')), '');
begin
  select * into v_request from content_requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id;
  end if;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_request.deleted_at is not null then
    raise exception 'INVALID_STATE: this request is in the bin — restore it first';
  end if;

  if v_request.status not in ('draft', 'source_review', 'content_development') then
    raise exception 'INVALID_STATE: the primary keyword cannot be changed while the request is %', v_request.status;
  end if;

  update content_requests
  set supplied_primary_keyword = v_value,
      resolved_primary_keyword = v_value
  where id = p_request_id
  returning * into v_request;

  insert into activity_events (request_id, event_type, message, actor_id, metadata)
  values (p_request_id, 'primary_keyword_changed',
    case when v_value is null
      then 'Primary keyword cleared — it will be derived from research again'
      else 'Primary keyword set to "' || v_value || '"'
    end,
    auth.uid(), jsonb_build_object('primaryKeyword', v_value));

  return v_request;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function set_request_cta(p_request_id uuid, p_cta text)
returns content_requests as $$
declare
  v_request content_requests;
  v_value text := nullif(btrim(coalesce(p_cta, '')), '');
begin
  select * into v_request from content_requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id;
  end if;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_request.deleted_at is not null then
    raise exception 'INVALID_STATE: this request is in the bin — restore it first';
  end if;

  if v_request.status not in ('draft', 'source_review', 'content_development') then
    raise exception 'INVALID_STATE: the call to action cannot be changed while the request is %', v_request.status;
  end if;

  update content_requests
  set supplied_cta = v_value,
      resolved_cta = v_value
  where id = p_request_id
  returning * into v_request;

  insert into activity_events (request_id, event_type, message, actor_id, metadata)
  values (p_request_id, 'cta_changed',
    case when v_value is null
      then 'Call to action cleared — the writer will choose one again'
      else 'Call to action set to "' || v_value || '"'
    end,
    auth.uid(), jsonb_build_object('cta', v_value));

  return v_request;
end;
$$ language plpgsql security definer set search_path = public;

-- NOT VALID on purpose. notification_attempts is a delivery log, and it
-- holds rows for messages that really were sent to a reviewer channel back
-- when one existed. Rewriting or deleting them to satisfy a new constraint
-- would falsify the log; NOT VALID stops anything new being written with a
-- dead channel while leaving what actually happened alone.
alter table notification_attempts drop constraint if exists notification_attempts_channel_check;
alter table notification_attempts add constraint notification_attempts_channel_check check (
  channel in ('content_manager', 'system_errors')
) not valid;
-- Re-emitted from 009 with one word removed: it returned an approved
-- request to content_development on a new version, and did the same for a
-- changes_requested one. That status no longer exists.
create or replace function create_artifact_version(
  p_artifact_id uuid,
  p_expected_current_version_id uuid default null,
  p_change_type text default 'initial_generation',
  p_content jsonb default '{}'::jsonb,
  p_content_hash text default '',
  p_source_set_version_id uuid default null,
  p_content_plan_id uuid default null,
  p_base_article_version_id uuid default null
) returns artifact_versions as $$
declare
  v_artifact content_artifacts;
  v_request content_requests;
  v_next_version integer;
  v_automatic_revision_count integer;
  v_version artifact_versions;
begin
  select * into v_artifact from content_artifacts where id = p_artifact_id for update;

  if v_artifact.id is null then
    raise exception 'NOT_FOUND: artifact % does not exist', p_artifact_id;
  end if;

  select * into v_request from content_requests where id = v_artifact.request_id for update;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_artifact.current_version_id is distinct from p_expected_current_version_id then
    raise exception 'STALE_VERSION: artifact changed since this edit/generation started';
  end if;

  if p_change_type not in ('initial_generation', 'automatic_revision', 'manual_edit', 'targeted_regeneration', 'channel_adaptation') then
    raise exception 'VALIDATION_ERROR: invalid change type %', p_change_type;
  end if;

  if p_change_type = 'automatic_revision' then
    select count(*) into v_automatic_revision_count
    from artifact_versions
    where artifact_id = p_artifact_id and change_type = 'automatic_revision';

    if v_automatic_revision_count >= 1 then
      raise exception 'INVALID_STATE: this article option already used its one automatic revision';
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version
  from artifact_versions where artifact_id = p_artifact_id;

  insert into artifact_versions (
    artifact_id, version_number, change_type, content, content_hash,
    source_set_version_id, content_plan_id, base_article_version_id, created_by
  ) values (
    p_artifact_id, v_next_version, p_change_type, p_content, p_content_hash,
    p_source_set_version_id, p_content_plan_id, p_base_article_version_id, auth.uid()
  ) returning * into v_version;

  update content_artifacts set current_version_id = v_version.id where id = p_artifact_id;

  if v_request.status = 'approved' then
    update content_requests set status = 'content_development' where id = v_request.id;
  end if;

  insert into activity_events (request_id, event_type, message, actor_id, metadata)
  values (
    v_artifact.request_id, 'artifact_version_created',
    format('%s v%s created (%s)', v_artifact.kind, v_next_version, p_change_type),
    auth.uid(),
    jsonb_build_object('artifactId', p_artifact_id, 'versionId', v_version.id, 'changeType', p_change_type)
  );

  return v_version;
end;
$$ language plpgsql security definer set search_path = public;
