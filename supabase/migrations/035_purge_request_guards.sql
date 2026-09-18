-- purge_request had no guards of its own.
--
-- It was written as the destructive half of purge_expired_requests(),
-- which does the filtering before calling it — so it checked neither who
-- was asking nor whether the request was in the bin. That was survivable
-- while nothing else called it. Giving the UI a "Delete forever" button
-- made it reachable directly, and a security-definer function with no
-- ownership check is one that lets any signed-in caller destroy any
-- request by id, live or not.
--
-- The guards go in the function rather than in the action that calls it,
-- because the function is the thing with the elevated rights. A caller
-- that forgets to check is then wrong rather than dangerous.
--
-- The expiry sweep calls the unguarded work directly: it runs as the
-- system, has already selected on the retention window, and has no
-- auth.uid() to compare against.
create or replace function purge_request_unchecked(p_request_id uuid) returns text[] as $$
declare
  v_storage_paths text[];
begin
  select coalesce(array_agg(storage_path), '{}')
  into v_storage_paths
  from supporting_materials
  where request_id = p_request_id and storage_path is not null;

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

  delete from content_requests where id = p_request_id;

  return v_storage_paths;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function purge_request_unchecked(uuid) from public, anon, authenticated;

create or replace function purge_request(p_request_id uuid) returns text[] as $$
declare
  v_request content_requests%rowtype;
begin
  select * into v_request from content_requests where id = p_request_id;

  if not found then
    raise exception 'NOT_FOUND: this request no longer exists';
  end if;

  if auth.uid() is null or v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  -- Deleting for good is the second of two deliberate steps. A request
  -- that has not been binned cannot be destroyed in one call, however the
  -- call is made.
  if v_request.deleted_at is null then
    raise exception 'INVALID_STATE: bin this request before deleting it for good';
  end if;

  return purge_request_unchecked(p_request_id);
end;
$$ language plpgsql security definer set search_path = public;

-- The sweep runs as the system: there is no auth.uid() to own anything,
-- and it has already selected exactly the rows past the retention window.
-- It therefore calls the unchecked form directly; going through the
-- guarded one would make the bin never empty itself.
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
    v_paths := v_paths || purge_request_unchecked(v_id);
  end loop;
  return v_paths;
end;
$$ language plpgsql security definer set search_path = public;

-- purge_request was never granted to authenticated, because until now
-- nothing but purge_expired_requests() called it. Now that it checks
-- ownership and refuses anything not already binned, the Delete forever
-- button can reach it.
grant execute on function purge_request(uuid) to authenticated;
