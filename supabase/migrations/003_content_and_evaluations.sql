-- Koya Content Studio (Week 4) — content plans, articles/channel artifacts, evaluations
-- See ../../SYSTEM-DESIGN-NEXTJS.md §14, §15, §17, §32 for the authoritative spec.

-- ---------------------------------------------------------------------------
-- content_plans
--
-- Immutable once used to generate content; editing creates a new version
-- (SYSTEM-DESIGN-NEXTJS.md §14).
-- ---------------------------------------------------------------------------

create table content_plans (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references content_requests(id) on delete cascade,
  source_set_version_id uuid not null references source_set_versions(id),
  version_number integer not null,

  primary_keyword text not null,
  secondary_keywords jsonb not null default '[]'::jsonb,
  search_intent text null,
  angle text null,
  title text not null,
  sections jsonb not null default '[]'::jsonb,
  cta_direction text null,
  links jsonb not null default '[]'::jsonb,
  known_limitations text null,

  -- FK to operation_runs added in 004_operations_activity_errors.sql once that table exists.
  created_by_operation_run_id uuid null,
  created_by uuid null references profiles(user_id),

  created_at timestamptz not null default now(),
  unique (request_id, version_number)
);

create index content_plans_request_id_idx on content_plans (request_id);

alter table content_requests
  add constraint content_requests_current_plan_id_fkey
  foreign key (current_plan_id) references content_plans(id);

-- ---------------------------------------------------------------------------
-- content_artifacts
--
-- Logical public-facing content items: article (slots A/B/C) or a single
-- linkedin/x/newsletter channel asset per request (SYSTEM-DESIGN-NEXTJS.md §32.10).
-- ---------------------------------------------------------------------------

create table content_artifacts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references content_requests(id) on delete cascade,

  kind text not null check (kind in ('article', 'linkedin', 'x', 'newsletter')),
  slot text null check (slot in ('A', 'B', 'C')),
  check ((kind = 'article') = (slot is not null)),

  -- FK to artifact_versions added below once that table exists.
  current_version_id uuid null,

  created_at timestamptz not null default now()
);

create unique index content_artifacts_article_slot_unique
  on content_artifacts (request_id, slot)
  where kind = 'article';

create unique index content_artifacts_channel_unique
  on content_artifacts (request_id, kind)
  where kind <> 'article';

create index content_artifacts_request_id_idx on content_artifacts (request_id);

-- ---------------------------------------------------------------------------
-- artifact_versions
--
-- Immutable content revisions (SYSTEM-DESIGN-NEXTJS.md §32.11). Only ever
-- created by the create_artifact_version RPC (008_business_rpcs.sql), which
-- enforces optimistic concurrency and the one-automatic-revision limit.
-- ---------------------------------------------------------------------------

create table artifact_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references content_artifacts(id) on delete cascade,
  version_number integer not null,

  change_type text not null check (
    change_type in ('initial_generation', 'automatic_revision', 'manual_edit', 'targeted_regeneration', 'channel_adaptation')
  ),

  content jsonb not null,
  content_hash text not null,

  source_set_version_id uuid not null references source_set_versions(id),
  content_plan_id uuid null references content_plans(id),
  base_article_version_id uuid null references artifact_versions(id),

  -- FK to operation_runs added in 004_operations_activity_errors.sql once that table exists.
  operation_run_id uuid null,
  created_by uuid null references profiles(user_id),

  created_at timestamptz not null default now(),
  unique (artifact_id, version_number)
);

create index artifact_versions_artifact_id_idx on artifact_versions (artifact_id);

alter table content_artifacts
  add constraint content_artifacts_current_version_id_fkey
  foreign key (current_version_id) references artifact_versions(id);

alter table content_requests
  add constraint content_requests_selected_article_version_id_fkey
  foreign key (selected_article_version_id) references artifact_versions(id);

-- ---------------------------------------------------------------------------
-- evaluations
--
-- A failed evaluator call creates no valid evaluation row (the failure
-- belongs to operation_runs) (SYSTEM-DESIGN-NEXTJS.md §32.12).
-- ---------------------------------------------------------------------------

create table evaluations (
  id uuid primary key default gen_random_uuid(),
  artifact_version_id uuid not null references artifact_versions(id) on delete cascade,

  overall_status text not null check (overall_status in ('pass', 'revise', 'reject')),
  deterministic_checks jsonb not null default '[]'::jsonb,
  criteria jsonb not null default '[]'::jsonb,
  claim_audit jsonb not null default '[]'::jsonb,
  unsupported_claims jsonb not null default '[]'::jsonb,
  sections_needing_revision jsonb not null default '[]'::jsonb,
  revision_instructions text null,

  -- FK to operation_runs added in 004_operations_activity_errors.sql once that table exists.
  operation_run_id uuid null,
  created_by uuid null references profiles(user_id),

  created_at timestamptz not null default now()
);

create index evaluations_artifact_version_id_idx on evaluations (artifact_version_id, created_at desc);
