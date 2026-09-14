-- Koya Content Studio (Week 4) — core schema
-- See ../../SYSTEM-DESIGN-NEXTJS.md §32 for the authoritative spec this implements.
--
-- Convention (matching Week 3): workflow-state columns use `text ... check (... in (...))`
-- rather than native Postgres enums, so adding a value later is a plain
-- constraint change instead of an enum-alteration migration.

create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('content_manager', 'reviewer')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- content_requests
--
-- current_source_set_id / current_plan_id / selected_article_version_id /
-- current_package_id reference tables created in later migrations. The
-- columns exist here so the root business object is defined in one place;
-- their foreign-key constraints are added once the referenced tables exist
-- (002/003/003/005).
-- ---------------------------------------------------------------------------

create table content_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(user_id),

  topic text not null,

  -- Supplied vs resolved intake fields stay distinguishable (SYSTEM-DESIGN-NEXTJS.md §7.3).
  supplied_audience text null,
  supplied_objective text null,
  supplied_tone text null,
  supplied_cta text null,
  supplied_primary_keyword text null,
  resolved_audience text not null,
  resolved_objective text not null,
  resolved_tone text not null,
  resolved_cta text null,
  resolved_primary_keyword text null,

  additional_instructions text null,
  source_urls jsonb not null default '[]'::jsonb,
  publication_date date null,

  status text not null default 'draft' check (
    status in (
      'draft', 'source_review', 'content_development', 'pending_approval',
      'changes_requested', 'approved', 'rejected', 'archived'
    )
  ),

  -- Only meaningful when ENABLE_AI_TEST_MODE=true; the app must ignore/reject
  -- this outside test mode (SYSTEM-DESIGN-NEXTJS.md §4.9, §12.4).
  test_model_choice text null check (test_model_choice in ('gemini', 'claude_haiku_4_5', 'claude_sonnet_5')),

  current_source_set_id uuid null,
  current_plan_id uuid null,
  selected_article_version_id uuid null,
  current_package_id uuid null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_requests_owner_id_idx on content_requests (owner_id);
create index content_requests_status_idx on content_requests (status);

create trigger content_requests_set_updated_at
  before update on content_requests
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- activity_events
--
-- Created here (ahead of migration 004) because every later RPC in this
-- migration set writes to it as part of its transaction.
-- ---------------------------------------------------------------------------

create table activity_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references content_requests(id) on delete cascade,
  event_type text not null,
  message text not null,
  actor_id uuid null references profiles(user_id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_events_request_id_idx on activity_events (request_id, created_at);

-- ---------------------------------------------------------------------------
-- storage buckets (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('content-support', 'content-support', false)
on conflict (id) do nothing;
