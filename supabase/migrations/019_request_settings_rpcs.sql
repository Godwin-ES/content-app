-- Koya Content Studio (Week 4) — let the owner change a request's primary
-- keyword, CTA, and supplied-sources-only flag after intake.
--
-- content_requests has no UPDATE policy by design: every mutation goes
-- through a security-definer RPC. setSuppliedSourcesOnlyAction did not get
-- that memo — it issued a plain `.update()`, which RLS silently narrowed to
-- zero rows, so the checkbox on the Research tab reported success and
-- changed nothing. These three functions are the missing RPCs.
--
-- Primary keyword and CTA are optional at intake and derived when absent
-- (the keyword from the research plan, the CTA by the writer), so "clear
-- it" has to be expressible: an empty or blank p_value resets both the
-- supplied and the resolved column to null, which puts the field back in
-- the hands of whichever step derives it.

-- ---------------------------------------------------------------------------
-- set_request_primary_keyword
-- ---------------------------------------------------------------------------

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

  -- Editable right up to submission. Past that the package under review is
  -- the thing being judged, and changing what it was written to target
  -- behind the Reviewer's back would make their decision meaningless.
  if v_request.status not in ('draft', 'source_review', 'content_development', 'changes_requested') then
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

-- ---------------------------------------------------------------------------
-- set_request_cta
-- ---------------------------------------------------------------------------

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

  if v_request.status not in ('draft', 'source_review', 'content_development', 'changes_requested') then
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

-- ---------------------------------------------------------------------------
-- set_supplied_sources_only
-- ---------------------------------------------------------------------------

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

  -- Draft only: once research has run, the source set it produced is what
  -- the rest of the pipeline is built on.
  if v_request.status <> 'draft' then
    raise exception 'INVALID_STATE: research has already started, so this can no longer be changed';
  end if;

  update content_requests
  set supplied_sources_only = coalesce(p_value, false)
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$ language plpgsql security definer set search_path = public;
