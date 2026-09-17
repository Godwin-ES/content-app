-- Koya Content Studio (Week 4) — the Reviewer's decision set narrows to
-- Approve / Request Changes.
--
-- 'rejected' differed from 'changes_requested' in exactly one mechanical
-- way: it blocked resubmission until the owner explicitly called
-- reopen_rejected_request. Both decisions otherwise wrote the same kind of
-- review row, sent the same notification, and landed the request in the
-- same "Needs Attention" bucket, so that speed bump was invisible until
-- someone walked into it. Dropping the state removes a branch the product
-- never actually distinguished, and retires the reopen RPC that existed
-- only to undo it.
--
-- Tightening both CHECK constraints is safe: neither table has ever held a
-- 'rejected' row (verified against the live database before writing this).

alter table content_requests drop constraint if exists content_requests_status_check;
alter table content_requests add constraint content_requests_status_check check (
  status in (
    'draft', 'source_review', 'content_development', 'pending_approval',
    'changes_requested', 'approved', 'archived'
  )
);

alter table approval_reviews drop constraint if exists approval_reviews_status_check;
alter table approval_reviews add constraint approval_reviews_status_check check (
  status in ('pending', 'withdrawn', 'approved', 'changes_requested')
);

drop function if exists reopen_rejected_request(uuid);

-- Same body as 009_rpc_optional_params.sql's version, with 'rejected'
-- removed from the accepted decisions and from the activity message.
create or replace function decide_package_review(
  p_review_id uuid,
  p_package_id uuid,
  p_decision text,
  p_comment text default null
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

  if p_decision not in ('approved', 'changes_requested') then
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
      else 'Changes requested'
    end,
    auth.uid(),
    jsonb_build_object('reviewId', v_review.id, 'decision', p_decision)
  );

  return v_review;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function decide_package_review(uuid, uuid, text, text) from public, anon;
grant execute on function decide_package_review(uuid, uuid, text, text) to authenticated;
