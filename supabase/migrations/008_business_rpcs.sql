-- Koya Content Studio (Week 4) — transactional business RPCs
-- See ../../SYSTEM-DESIGN-NEXTJS.md §10.6, §18, §23-25, §27, §33 for the authoritative spec.
--
-- Every function derives the acting user from auth.uid() and never accepts
-- an actor id as an argument. Error messages are prefixed with the
-- DomainError code they map to (lib/domain/errors.ts) so the repository
-- layer can translate a raised exception into the typed ActionError contract
-- without parsing raw Postgres/SQL text.

-- ---------------------------------------------------------------------------
-- confirm_source_set
-- ---------------------------------------------------------------------------

create or replace function confirm_source_set(p_request_id uuid) returns source_set_versions as $$
declare
  v_request content_requests;
  v_next_version integer;
  v_source_set source_set_versions;
  v_accepted_count integer;
  v_unresolved_conflicts integer;
begin
  select * into v_request from content_requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id;
  end if;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_request.status <> 'source_review' then
    raise exception 'INVALID_STATE: request is not in source review (status: %)', v_request.status;
  end if;

  select count(distinct rs.id) into v_accepted_count
  from research_sources rs
  where rs.request_id = p_request_id
    and rs.retrieval_status = 'usable'
    and (
      select decision from source_review_decisions srd
      where srd.source_id = rs.id
      order by created_at desc
      limit 1
    ) = 'accepted';

  if v_accepted_count < 1 then
    raise exception 'INVALID_STATE: at least one usable accepted source is required to confirm a source set';
  end if;

  select count(*) into v_unresolved_conflicts
  from source_conflicts
  where request_id = p_request_id and resolution is null;

  if v_unresolved_conflicts > 0 then
    raise exception 'INVALID_STATE: % unresolved source conflict(s) must be resolved before confirming', v_unresolved_conflicts;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version
  from source_set_versions where request_id = p_request_id;

  insert into source_set_versions (request_id, version_number, confirmed_by)
  values (p_request_id, v_next_version, auth.uid())
  returning * into v_source_set;

  insert into source_set_items (source_set_version_id, source_id)
  select v_source_set.id, rs.id
  from research_sources rs
  where rs.request_id = p_request_id
    and rs.retrieval_status = 'usable'
    and (
      select decision from source_review_decisions srd
      where srd.source_id = rs.id
      order by created_at desc
      limit 1
    ) = 'accepted';

  update content_requests
  set current_source_set_id = v_source_set.id, status = 'content_development'
  where id = p_request_id;

  insert into activity_events (request_id, event_type, message, actor_id, metadata)
  values (p_request_id, 'source_set_confirmed', format('Source Set v%s confirmed', v_next_version), auth.uid(),
    jsonb_build_object('sourceSetVersionId', v_source_set.id, 'versionNumber', v_next_version));

  return v_source_set;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- create_artifact_version
-- ---------------------------------------------------------------------------

create or replace function create_artifact_version(
  p_artifact_id uuid,
  p_expected_current_version_id uuid,
  p_change_type text,
  p_content jsonb,
  p_content_hash text,
  p_source_set_version_id uuid,
  p_content_plan_id uuid,
  p_base_article_version_id uuid
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

  -- A public-facing edit after approval/changes-requested means a newer
  -- draft now exists; the previously approved package stays historically
  -- valid, but the request itself is editable again (SYSTEM-DESIGN-NEXTJS.md §24.6, plan Task 3 Step 4).
  if v_request.status in ('approved', 'changes_requested') then
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

-- ---------------------------------------------------------------------------
-- create_content_package
-- ---------------------------------------------------------------------------

create or replace function create_content_package(
  p_request_id uuid,
  p_article_version_id uuid,
  p_article_evaluation_id uuid,
  p_linkedin_version_id uuid,
  p_linkedin_evaluation_id uuid,
  p_x_version_id uuid,
  p_x_evaluation_id uuid,
  p_newsletter_version_id uuid,
  p_newsletter_evaluation_id uuid,
  p_snapshot jsonb,
  p_snapshot_hash text
) returns content_packages as $$
declare
  v_request content_requests;
  v_next_version integer;
  v_package content_packages;
begin
  select * into v_request from content_requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id;
  end if;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_request.current_source_set_id is null then
    raise exception 'INVALID_STATE: request has no confirmed source set';
  end if;

  perform 1 from artifact_versions av join content_artifacts ca on ca.id = av.artifact_id
    where av.id = p_article_version_id and ca.request_id = p_request_id and ca.kind = 'article';
  if not found then
    raise exception 'VALIDATION_ERROR: article version does not belong to this request';
  end if;

  perform 1 from artifact_versions av join content_artifacts ca on ca.id = av.artifact_id
    where av.id = p_linkedin_version_id and ca.request_id = p_request_id and ca.kind = 'linkedin';
  if not found then
    raise exception 'VALIDATION_ERROR: linkedin version does not belong to this request';
  end if;

  perform 1 from artifact_versions av join content_artifacts ca on ca.id = av.artifact_id
    where av.id = p_x_version_id and ca.request_id = p_request_id and ca.kind = 'x';
  if not found then
    raise exception 'VALIDATION_ERROR: x version does not belong to this request';
  end if;

  perform 1 from artifact_versions av join content_artifacts ca on ca.id = av.artifact_id
    where av.id = p_newsletter_version_id and ca.request_id = p_request_id and ca.kind = 'newsletter';
  if not found then
    raise exception 'VALIDATION_ERROR: newsletter version does not belong to this request';
  end if;

  perform 1 from evaluations
    where id = p_article_evaluation_id and artifact_version_id = p_article_version_id and overall_status = 'pass';
  if not found then
    raise exception 'APPROVAL_REQUIRED: article does not have a passing current evaluation';
  end if;

  perform 1 from evaluations
    where id = p_linkedin_evaluation_id and artifact_version_id = p_linkedin_version_id and overall_status = 'pass';
  if not found then
    raise exception 'APPROVAL_REQUIRED: linkedin asset does not have a passing current evaluation';
  end if;

  perform 1 from evaluations
    where id = p_x_evaluation_id and artifact_version_id = p_x_version_id and overall_status = 'pass';
  if not found then
    raise exception 'APPROVAL_REQUIRED: x asset does not have a passing current evaluation';
  end if;

  perform 1 from evaluations
    where id = p_newsletter_evaluation_id and artifact_version_id = p_newsletter_version_id and overall_status = 'pass';
  if not found then
    raise exception 'APPROVAL_REQUIRED: newsletter asset does not have a passing current evaluation';
  end if;

  perform 1 from artifact_versions where id = p_article_version_id and source_set_version_id = v_request.current_source_set_id;
  if not found then
    raise exception 'INVALID_STATE: article was generated from a source set that is no longer current';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version
  from content_packages where request_id = p_request_id;

  insert into content_packages (
    request_id, version_number, source_set_version_id,
    article_version_id, article_evaluation_id,
    linkedin_version_id, linkedin_evaluation_id,
    x_version_id, x_evaluation_id,
    newsletter_version_id, newsletter_evaluation_id,
    snapshot, snapshot_hash, created_by
  ) values (
    p_request_id, v_next_version, v_request.current_source_set_id,
    p_article_version_id, p_article_evaluation_id,
    p_linkedin_version_id, p_linkedin_evaluation_id,
    p_x_version_id, p_x_evaluation_id,
    p_newsletter_version_id, p_newsletter_evaluation_id,
    p_snapshot, p_snapshot_hash, auth.uid()
  ) returning * into v_package;

  update content_requests set current_package_id = v_package.id where id = p_request_id;

  insert into activity_events (request_id, event_type, message, actor_id, metadata)
  values (p_request_id, 'package_created', format('Package v%s created', v_next_version), auth.uid(),
    jsonb_build_object('packageId', v_package.id, 'versionNumber', v_next_version));

  return v_package;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- submit_package_for_review
-- ---------------------------------------------------------------------------

create or replace function submit_package_for_review(p_request_id uuid, p_package_id uuid) returns approval_reviews as $$
declare
  v_request content_requests;
  v_review approval_reviews;
begin
  select * into v_request from content_requests where id = p_request_id for update;

  if v_request.id is null then
    raise exception 'NOT_FOUND: request % does not exist', p_request_id;
  end if;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_request.status not in ('content_development', 'changes_requested') then
    raise exception 'INVALID_STATE: request is not ready for submission (status: %)', v_request.status;
  end if;

  if v_request.current_package_id is distinct from p_package_id then
    raise exception 'STALE_VERSION: package is no longer the request''s current package';
  end if;

  perform 1 from approval_reviews where request_id = p_request_id and status = 'pending';
  if found then
    raise exception 'INVALID_STATE: a review is already pending for this request';
  end if;

  insert into approval_reviews (request_id, package_id, submitted_by)
  values (p_request_id, p_package_id, auth.uid())
  returning * into v_review;

  update content_requests set status = 'pending_approval' where id = p_request_id;

  insert into activity_events (request_id, event_type, message, actor_id, metadata)
  values (p_request_id, 'package_submitted', 'Package submitted for approval', auth.uid(),
    jsonb_build_object('reviewId', v_review.id, 'packageId', p_package_id));

  return v_review;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- withdraw_package_review
-- ---------------------------------------------------------------------------

create or replace function withdraw_package_review(p_review_id uuid) returns approval_reviews as $$
declare
  v_review approval_reviews;
  v_request content_requests;
begin
  select * into v_review from approval_reviews where id = p_review_id for update;

  if v_review.id is null then
    raise exception 'NOT_FOUND: review % does not exist', p_review_id;
  end if;

  select * into v_request from content_requests where id = v_review.request_id for update;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_review.status <> 'pending' then
    raise exception 'INVALID_STATE: review is not pending (status: %)', v_review.status;
  end if;

  update approval_reviews
  set status = 'withdrawn', decided_by = auth.uid(), decided_at = now()
  where id = p_review_id
  returning * into v_review;

  update content_requests set status = 'content_development' where id = v_review.request_id;

  insert into activity_events (request_id, event_type, message, actor_id, metadata)
  values (v_review.request_id, 'package_withdrawn', 'Submission withdrawn', auth.uid(),
    jsonb_build_object('reviewId', v_review.id));

  return v_review;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- decide_package_review
-- ---------------------------------------------------------------------------

create or replace function decide_package_review(
  p_review_id uuid,
  p_package_id uuid,
  p_decision text,
  p_comment text
) returns approval_reviews as $$
declare
  v_review approval_reviews;
  v_request content_requests;
  v_reviewer_role text;
begin
  select role into v_reviewer_role from profiles where user_id = auth.uid();
  if v_reviewer_role is distinct from 'reviewer' then
    raise exception 'PERMISSION_DENIED: only a reviewer can decide a package review';
  end if;

  if p_decision not in ('approved', 'changes_requested', 'rejected') then
    raise exception 'VALIDATION_ERROR: invalid decision %', p_decision;
  end if;

  select * into v_review from approval_reviews where id = p_review_id for update;

  if v_review.id is null then
    raise exception 'NOT_FOUND: review % does not exist', p_review_id;
  end if;

  if v_review.submitted_by = auth.uid() then
    raise exception 'SELF_APPROVAL: you cannot decide a review you submitted yourself';
  end if;

  if v_review.status <> 'pending' then
    raise exception 'INVALID_STATE: review is not pending (status: %)', v_review.status;
  end if;

  if v_review.package_id <> p_package_id then
    raise exception 'STALE_VERSION: the reviewed package has been superseded';
  end if;

  select * into v_request from content_requests where id = v_review.request_id for update;

  if v_request.status <> 'pending_approval' then
    raise exception 'INVALID_STATE: request is not pending approval (status: %)', v_request.status;
  end if;

  update approval_reviews
  set status = p_decision, decided_by = auth.uid(), decided_at = now(), comment = p_comment
  where id = p_review_id
  returning * into v_review;

  update content_requests set status = p_decision where id = v_review.request_id;

  insert into activity_events (request_id, event_type, message, actor_id, metadata)
  values (
    v_review.request_id, 'package_review_decided',
    case p_decision
      when 'approved' then 'Package approved'
      when 'changes_requested' then 'Changes requested'
      else 'Package rejected'
    end,
    auth.uid(),
    jsonb_build_object('reviewId', v_review.id, 'decision', p_decision)
  );

  return v_review;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- create_queue_item
-- ---------------------------------------------------------------------------

create or replace function create_queue_item(
  p_package_id uuid,
  p_channel text,
  p_channel_artifact_version_id uuid,
  p_scheduled_at timestamptz,
  p_timezone text,
  p_idempotency_key text
) returns publishing_queue_items as $$
declare
  v_package content_packages;
  v_request content_requests;
  v_expected_version_id uuid;
  v_existing publishing_queue_items;
  v_item publishing_queue_items;
begin
  select * into v_existing from publishing_queue_items where idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  if p_channel not in ('linkedin', 'x', 'newsletter') then
    raise exception 'VALIDATION_ERROR: invalid channel %', p_channel;
  end if;

  select * into v_package from content_packages where id = p_package_id for update;
  if v_package.id is null then
    raise exception 'NOT_FOUND: package % does not exist', p_package_id;
  end if;

  select * into v_request from content_requests where id = v_package.request_id for update;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_request.status <> 'approved' or v_request.current_package_id is distinct from p_package_id then
    raise exception 'APPROVAL_REQUIRED: only the exact current approved package can be queued';
  end if;

  v_expected_version_id := case p_channel
    when 'linkedin' then v_package.linkedin_version_id
    when 'x' then v_package.x_version_id
    else v_package.newsletter_version_id
  end;

  if v_expected_version_id is distinct from p_channel_artifact_version_id then
    raise exception 'VALIDATION_ERROR: channel artifact version does not match the approved package';
  end if;

  if p_scheduled_at is not null then
    if p_scheduled_at <= now() then
      raise exception 'VALIDATION_ERROR: scheduled time must be in the future';
    end if;
    if p_timezone is null or length(trim(p_timezone)) = 0 then
      raise exception 'VALIDATION_ERROR: timezone is required for a scheduled item';
    end if;
  end if;

  perform 1 from publishing_queue_items
  where package_id = p_package_id and channel = p_channel and status in ('queued', 'scheduled');
  if found then
    raise exception 'DUPLICATE_QUEUE_ITEM: an active % item already exists for this package', p_channel;
  end if;

  begin
    insert into publishing_queue_items (
      package_id, request_id, channel, channel_artifact_version_id,
      status, scheduled_at, timezone, idempotency_key, created_by
    ) values (
      p_package_id, v_package.request_id, p_channel, p_channel_artifact_version_id,
      case when p_scheduled_at is not null then 'scheduled' else 'queued' end,
      p_scheduled_at, p_timezone, p_idempotency_key, auth.uid()
    ) returning * into v_item;
  exception
    when unique_violation then
      raise exception 'DUPLICATE_QUEUE_ITEM: an active % item already exists for this package', p_channel;
  end;

  insert into publishing_events (queue_item_id, event_type, actor_id)
  values (v_item.id, 'created', auth.uid());

  return v_item;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- reschedule_queue_item
-- ---------------------------------------------------------------------------

create or replace function reschedule_queue_item(
  p_queue_item_id uuid,
  p_scheduled_at timestamptz,
  p_timezone text
) returns publishing_queue_items as $$
declare
  v_item publishing_queue_items;
  v_request content_requests;
begin
  select * into v_item from publishing_queue_items where id = p_queue_item_id for update;
  if v_item.id is null then
    raise exception 'NOT_FOUND: queue item % does not exist', p_queue_item_id;
  end if;

  select * into v_request from content_requests where id = v_item.request_id;
  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_item.status not in ('queued', 'scheduled') then
    raise exception 'INVALID_STATE: queue item is not active (status: %)', v_item.status;
  end if;

  if p_scheduled_at is not null then
    if p_scheduled_at <= now() then
      raise exception 'VALIDATION_ERROR: scheduled time must be in the future';
    end if;
    if p_timezone is null or length(trim(p_timezone)) = 0 then
      raise exception 'VALIDATION_ERROR: timezone is required for a scheduled item';
    end if;
  end if;

  update publishing_queue_items
  set scheduled_at = p_scheduled_at,
      timezone = p_timezone,
      status = case when p_scheduled_at is not null then 'scheduled' else 'queued' end
  where id = p_queue_item_id
  returning * into v_item;

  insert into publishing_events (queue_item_id, event_type, actor_id)
  values (v_item.id, 'rescheduled', auth.uid());

  return v_item;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- cancel_queue_item
-- ---------------------------------------------------------------------------

create or replace function cancel_queue_item(p_queue_item_id uuid, p_reason text) returns publishing_queue_items as $$
declare
  v_item publishing_queue_items;
  v_request content_requests;
begin
  select * into v_item from publishing_queue_items where id = p_queue_item_id for update;
  if v_item.id is null then
    raise exception 'NOT_FOUND: queue item % does not exist', p_queue_item_id;
  end if;

  select * into v_request from content_requests where id = v_item.request_id;
  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_item.status not in ('queued', 'scheduled') then
    raise exception 'INVALID_STATE: queue item is not active (status: %)', v_item.status;
  end if;

  update publishing_queue_items set status = 'cancelled' where id = p_queue_item_id returning * into v_item;

  insert into publishing_events (queue_item_id, event_type, actor_id, reason)
  values (v_item.id, 'cancelled', auth.uid(), p_reason);

  return v_item;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- grants
--
-- Security-definer functions run with the owning role's privileges, so
-- execute access must be restricted explicitly to the authenticated role.
-- ---------------------------------------------------------------------------

revoke all on function confirm_source_set from public, anon;
revoke all on function create_artifact_version from public, anon;
revoke all on function create_content_package from public, anon;
revoke all on function submit_package_for_review from public, anon;
revoke all on function withdraw_package_review from public, anon;
revoke all on function decide_package_review from public, anon;
revoke all on function create_queue_item from public, anon;
revoke all on function reschedule_queue_item from public, anon;
revoke all on function cancel_queue_item from public, anon;

grant execute on function confirm_source_set to authenticated;
grant execute on function create_artifact_version to authenticated;
grant execute on function create_content_package to authenticated;
grant execute on function submit_package_for_review to authenticated;
grant execute on function withdraw_package_review to authenticated;
grant execute on function decide_package_review to authenticated;
grant execute on function create_queue_item to authenticated;
grant execute on function reschedule_queue_item to authenticated;
grant execute on function cancel_queue_item to authenticated;
