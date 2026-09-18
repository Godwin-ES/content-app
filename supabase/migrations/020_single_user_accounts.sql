-- Koya Content Studio (Week 4) — one account, one person, no roles.
--
-- The two-role model (Content Manager writes, Reviewer approves) came from
-- the assumption of a team. The product this became is a single person's
-- content studio: they research, write, approve and publish their own work.
-- Splitting that person in two meant a second seeded login, a second
-- dashboard, and a self-approval rule that made the one real user unable to
-- approve anything they had made.
--
-- What does NOT change is the approval gate itself. The brief requires a
-- human to approve content before it is published, and that is still a
-- deliberate, recorded act on a specific package version — it is simply
-- the same human who wrote it. The approval_reviews trail is untouched.

-- ---------------------------------------------------------------------------
-- profiles: one role, kept as a column so every existing policy helper and
-- generated type keeps working rather than being torn out for a rename.
-- ---------------------------------------------------------------------------

alter table profiles drop constraint if exists profiles_role_check;
update profiles set role = 'owner' where role <> 'owner';
alter table profiles add constraint profiles_role_check check (role in ('owner'));
alter table profiles alter column role set default 'owner';

-- ---------------------------------------------------------------------------
-- Signing up creates the profile.
--
-- Profiles were previously created only by the seed script with the service
-- role key, because the only two accounts were seeded. Once anyone can sign
-- up — with a password or through Google — the profile has to appear with
-- the auth user or the new account lands on /auth/invalid-session, which is
-- the "valid session, no profile" dead end getCurrentUser already guards.
-- ---------------------------------------------------------------------------

create or replace function handle_new_auth_user() returns trigger as $$
begin
  insert into profiles (user_id, display_name, role)
  values (
    new.id,
    -- Google supplies a name; a password signup may pass one as metadata;
    -- otherwise fall back to the local part of the email, which is a better
    -- first impression than an empty header.
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, 'there'), '@', 1)
    ),
    'owner'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Lets someone correct the name the trigger guessed.
create or replace function set_display_name(p_display_name text) returns profiles as $$
declare
  v_profile profiles;
  v_value text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  if v_value is null then
    raise exception 'VALIDATION_ERROR: a display name cannot be empty';
  end if;

  update profiles set display_name = v_value where user_id = auth.uid() returning * into v_profile;

  if v_profile.user_id is null then
    raise exception 'NOT_FOUND: no profile for the current user';
  end if;

  return v_profile;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Visibility is ownership, and nothing else.
--
-- request_readable_by_current_user is the single funnel every other table's
-- policy goes through (sources, artifacts, packages, activity, publishing),
-- so removing the reviewer branch here removes cross-account visibility
-- everywhere at once.
-- ---------------------------------------------------------------------------

create or replace function request_readable_by_current_user(p_request_id uuid) returns boolean as $$
  select request_owned_by_current_user(p_request_id);
$$ language sql stable security definer set search_path = public;

drop function if exists request_visible_to_current_reviewer(uuid);

-- 010 inlined the reviewer branch into this policy to dodge a
-- self-referential subquery; with no reviewer, the row's own owner_id is
-- the whole rule.
drop policy if exists content_requests_select_readable on content_requests;
create policy content_requests_select_readable on content_requests
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists content_requests_insert_owner on content_requests;
create policy content_requests_insert_owner on content_requests
  for insert to authenticated
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- decide_package_review: the approver is the owner.
--
-- Drops two checks that no longer describe anything real: the reviewer-role
-- requirement, and SELF_APPROVAL. Keeping SELF_APPROVAL would mean no
-- package could ever be approved, since the only person who can see a
-- request is the one who created it.
--
-- Everything else is unchanged and still enforced: the review must be
-- pending, the package must still be the request's current one, and the
-- decision is recorded against a specific package version with its author
-- and timestamp.
-- ---------------------------------------------------------------------------

create or replace function decide_package_review(p_review_id uuid, p_package_id uuid, p_decision text, p_comment text default null)
returns approval_reviews as $$
declare
  v_review approval_reviews;
  v_request content_requests;
begin
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'VALIDATION_ERROR: decision must be approved or changes_requested';
  end if;

  select * into v_review from approval_reviews where id = p_review_id for update;

  if v_review.id is null then
    raise exception 'NOT_FOUND: review % does not exist', p_review_id;
  end if;

  select * into v_request from content_requests where id = v_review.request_id for update;

  if v_request.owner_id <> auth.uid() then
    raise exception 'PERMISSION_DENIED: you do not own this request';
  end if;

  if v_review.status <> 'pending' then
    raise exception 'INVALID_STATE: this review is no longer pending (status: %)', v_review.status;
  end if;

  if v_review.package_id is distinct from p_package_id then
    raise exception 'STALE_VERSION: the package under review has changed';
  end if;

  if v_request.current_package_id is distinct from p_package_id then
    raise exception 'STALE_VERSION: package is no longer the request''s current package';
  end if;

  if p_decision = 'changes_requested' and nullif(btrim(coalesce(p_comment, '')), '') is null then
    raise exception 'VALIDATION_ERROR: a comment is required when asking for changes';
  end if;

  update approval_reviews
  set status = p_decision, decided_by = auth.uid(), decided_at = now(), comment = p_comment
  where id = p_review_id
  returning * into v_review;

  update content_requests set status = p_decision where id = v_review.request_id;

  insert into activity_events (request_id, event_type, message, actor_id, metadata)
  values (v_review.request_id, 'package_review_decided',
    case when p_decision = 'approved' then 'Package approved' else 'Changes requested on the package' end,
    auth.uid(), jsonb_build_object('reviewId', p_review_id, 'packageId', p_package_id, 'decision', p_decision));

  return v_review;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- channel_connections: where approved content is destined.
--
-- Publishing queues rather than posts (the brief permits this), so these
-- are destinations, not OAuth tokens: the LinkedIn account a post is for,
-- the X handle, the list a newsletter goes to. They exist so the queue can
-- say where each item is headed, and warn when it has nowhere to go.
-- ---------------------------------------------------------------------------

create table channel_connections (
  user_id uuid not null references profiles(user_id) on delete cascade,
  channel text not null check (channel in ('linkedin', 'x', 'newsletter')),

  -- The visible identity: a LinkedIn profile or page, an X handle, or the
  -- name of a newsletter list.
  account_label text null,
  -- A link to that destination, where one exists.
  account_url text null,
  -- Newsletter only: who receives it.
  recipients jsonb not null default '[]'::jsonb,

  connected boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, channel)
);

create trigger channel_connections_set_updated_at
  before update on channel_connections
  for each row execute function set_updated_at();

alter table channel_connections enable row level security;

create policy channel_connections_select_own on channel_connections
  for select to authenticated
  using (user_id = auth.uid());

create policy channel_connections_insert_own on channel_connections
  for insert to authenticated
  with check (user_id = auth.uid());

create policy channel_connections_update_own on channel_connections
  for update to authenticated
  using (user_id = auth.uid());

create policy channel_connections_delete_own on channel_connections
  for delete to authenticated
  using (user_id = auth.uid());
