-- Koya Content Studio (Week 4) — explicit reopen of a rejected request
-- See ../../SYSTEM-DESIGN-NEXTJS.md §24 for the authoritative spec.
--
-- A rejected request must never silently become editable again; the
-- Content Manager must take a deliberate action, recorded in Activity
-- (IMPLEMENTATION-PLAN-NEXTJS.md Task 17 Step 2). Mirrors the shape of
-- withdraw_package_review in 008_business_rpcs.sql.

create or replace function reopen_rejected_request(p_request_id uuid) returns content_requests as $$
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

  if v_request.status <> 'rejected' then
    raise exception 'INVALID_STATE: request is not rejected (status: %)', v_request.status;
  end if;

  update content_requests set status = 'content_development' where id = p_request_id returning * into v_request;

  insert into activity_events (request_id, event_type, message, actor_id)
  values (p_request_id, 'request_reopened', 'Request reopened for further content development', auth.uid());

  return v_request;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function reopen_rejected_request from public, anon;
grant execute on function reopen_rejected_request to authenticated;
