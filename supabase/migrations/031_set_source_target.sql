-- Koya Content Studio (Week 4) — change how many pages a run should try.
--
-- Same rules as the scope flag it sits beside: yours, and only while the
-- source set is still open.

create or replace function set_source_target(p_request_id uuid, p_value integer)
returns content_requests as $$
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
    raise exception 'INVALID_STATE: this request is in the bin — restore it first';
  end if;

  if v_request.status not in ('draft', 'source_review') then
    raise exception 'INVALID_STATE: the source set is confirmed, so research settings can no longer be changed';
  end if;

  if p_value is null or p_value < 4 or p_value > 24 then
    raise exception 'VALIDATION_ERROR: research can attempt between 4 and 24 pages';
  end if;

  update content_requests set source_target = p_value where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function set_source_target(uuid, integer) from public, anon;
grant execute on function set_source_target(uuid, integer) to authenticated;
