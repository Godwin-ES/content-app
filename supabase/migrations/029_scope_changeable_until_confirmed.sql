-- Koya Content Studio (Week 4) — the research scope stays changeable until
-- the source set is confirmed.
--
-- set_supplied_sources_only refused unless the request was still a draft,
-- on the reasoning that once research has run, the source set it produced
-- is what the rest of the pipeline is built on. That is true of a
-- *confirmed* source set, not of one still under review — and it left the
-- most likely failure with no way out: supplied-only research that finds
-- nothing relevant, and a checkbox that can no longer be unticked to let
-- the web be searched instead.

create or replace function set_supplied_sources_only(p_request_id uuid, p_value boolean)
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
    raise exception 'INVALID_STATE: the source set is confirmed, so research scope can no longer be changed';
  end if;

  update content_requests
  set supplied_sources_only = coalesce(p_value, false)
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$ language plpgsql security definer set search_path = public;
