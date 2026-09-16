-- Koya Content Studio (Week 4) — delete a request, draft status only
-- Phase 1 of the post-Task-22 UX pass: a Content Manager may delete a
-- request outright only while nothing has been generated for it yet
-- (status = 'draft'). Everything generated once content development
-- begins stays governed by versioning/revert, never outright deletion —
-- this mirrors reopen_rejected_request.sql's shape and the same
-- ownership/state checks every other mutating RPC in this project uses.
--
-- Every child table's request_id FK cascades from content_requests
-- (confirmed: none of the non-cascading cross-reference FKs found during
-- Task 22's test-data-cleanup work — content_plans, content_artifacts,
-- artifact_versions, content_packages, approval_reviews,
-- publishing_queue_items — can exist yet at 'draft' status, since all of
-- them are created no earlier than 'content_development'), so a plain
-- delete is safe here without the explicit multi-step ordering that a
-- later-status request would need.

create or replace function delete_draft_request(p_request_id uuid) returns void as $$
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

  if v_request.status <> 'draft' then
    raise exception 'INVALID_STATE: only a draft request can be deleted (status: %)', v_request.status;
  end if;

  delete from content_requests where id = p_request_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function delete_draft_request from public, anon;
grant execute on function delete_draft_request to authenticated;
