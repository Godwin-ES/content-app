-- Koya Content Studio (Week 4) — let the purge reach Storage too.
--
-- 021 made deleting reversible and moved the permanent delete into
-- purge_request. That left a gap the old permanent delete did not have:
-- the old one removed the request's uploaded files from Storage first,
-- explicitly, because a database function cannot reach a storage bucket.
-- purge_request could not, so a purged request left its PDFs and DOCXs
-- behind forever.
--
-- The fix is to have the purge hand back the storage paths it just
-- orphaned, and let the caller — which does have a Storage client — delete
-- them. The sweep therefore moves out of delete_request/restore_request and
-- into the repository, which calls it before either operation and removes
-- whatever comes back.

-- Dropped rather than replaced: a function's return type cannot be changed
-- in place, and purge_expired_requests calls it, so that goes first.
drop function if exists purge_expired_requests();
drop function if exists purge_request(uuid);

create or replace function purge_request(p_request_id uuid) returns text[] as $$
declare
  v_storage_paths text[];
begin
  select coalesce(array_agg(storage_path), '{}')
  into v_storage_paths
  from supporting_materials
  where request_id = p_request_id and storage_path is not null;

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

  return v_storage_paths;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function purge_request(uuid) from public, anon, authenticated;

create or replace function purge_expired_requests() returns text[] as $$
declare
  v_id uuid;
  v_paths text[] := '{}';
begin
  for v_id in
    select id from content_requests
    where deleted_at is not null
      and deleted_at < now() - deleted_request_retention()
  loop
    v_paths := v_paths || purge_request(v_id);
  end loop;
  return v_paths;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function purge_expired_requests() from public, anon;
grant execute on function purge_expired_requests() to authenticated;

-- The sweep now belongs to the caller, which has a Storage client. Running
-- it inside these would delete the rows and silently strand the files.
create or replace function delete_request(p_request_id uuid) returns void as $$
declare
  v_request content_requests;
begin
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

create or replace function restore_request(p_request_id uuid) returns content_requests as $$
declare
  v_request content_requests;
begin
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

  if v_request.deleted_at < now() - deleted_request_retention() then
    raise exception 'INVALID_STATE: this request is past the 30-day restore window';
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
