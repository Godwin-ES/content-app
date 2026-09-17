-- Koya Content Studio (Week 4) — a request stays deletable until a
-- Reviewer has actually responded to it.
--
-- delete_draft_request only allowed 'draft', which meant a request
-- abandoned at any later point could never be cleared away — the Content
-- Manager was stuck looking at it forever. The real line is not how far
-- the work got but whether anyone else has weighed in: once a Reviewer has
-- approved it or asked for changes, that decision is part of the record and
-- deleting the request would destroy their feedback. A review that is still
-- pending (or was withdrawn) has produced no such feedback, so it does not
-- block deletion.
--
-- Unlike a draft, a later-status request cannot simply be cascade-deleted.
-- Several provenance FKs deliberately do not cascade
-- (artifact_versions.source_set_version_id and .content_plan_id,
-- content_packages' version columns, operation_runs.base_artifact_version_id),
-- so the dependants have to be removed in an explicit order first, exactly
-- as scripts/reset-test-data.ts documents. Getting that order wrong fails
-- loudly on a FK violation rather than silently half-deleting: every
-- statement here runs inside the function's single transaction.

drop function if exists delete_draft_request(uuid);

create or replace function delete_request(p_request_id uuid) returns void as $$
declare
  v_request content_requests;
  v_decided integer;
begin
  select * into v_request from content_requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id;
  end if;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  select count(*) into v_decided
  from approval_reviews
  where request_id = p_request_id and status in ('approved', 'changes_requested');

  if v_decided > 0 then
    raise exception 'INVALID_STATE: this request has reviewer feedback and can no longer be deleted';
  end if;

  -- Forward pointers first: these reference rows that are about to go.
  update content_requests
  set current_package_id = null,
      current_plan_id = null,
      selected_article_version_id = null,
      current_source_set_id = null
  where id = p_request_id;

  update content_artifacts set current_version_id = null where request_id = p_request_id;

  delete from publishing_queue_items where request_id = p_request_id;
  delete from approval_reviews where request_id = p_request_id;
  delete from content_packages where request_id = p_request_id;

  delete from evaluations
  where artifact_version_id in (
    select av.id from artifact_versions av
    join content_artifacts ca on ca.id = av.artifact_id
    where ca.request_id = p_request_id
  );

  delete from operation_runs where request_id = p_request_id;

  delete from artifact_versions
  where artifact_id in (select id from content_artifacts where request_id = p_request_id);

  delete from content_artifacts where request_id = p_request_id;
  delete from content_plans where request_id = p_request_id;

  -- Everything still standing (research_sources, source_evidence,
  -- source_set_versions, supporting_materials, activity_events, error_logs,
  -- notification_attempts) cascades from content_requests once the
  -- non-cascading references above are gone.
  delete from content_requests where id = p_request_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function delete_request(uuid) from public, anon;
grant execute on function delete_request(uuid) to authenticated;
