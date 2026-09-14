-- Koya Content Studio (Week 4) — operation runs, notifications, error logs
-- See ../../SYSTEM-DESIGN-NEXTJS.md §26, §27, §28, §32 for the authoritative spec.
--
-- activity_events was created in 001_core.sql because earlier tables'
-- fixtures/RPCs reference it. This migration adds operation_runs (and backfills
-- the FK columns left nullable on source_evidence/content_plans/artifact_versions/
-- evaluations in 002/003) plus notification_attempts and error_logs.

-- ---------------------------------------------------------------------------
-- operation_runs
--
-- No prompt-version, input-token, output-token, or latency metric is stored
-- (SYSTEM-DESIGN-NEXTJS.md §4.11, §32.17). started_at/finished_at exist only
-- for run recovery and stuck-run detection.
-- ---------------------------------------------------------------------------

create table operation_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references content_requests(id) on delete cascade,

  operation_type text not null check (
    operation_type in (
      'research_planning', 'web_search', 'source_retrieval', 'source_analysis',
      'content_planning', 'article_generation', 'article_evaluation', 'article_revision',
      'channel_adaptation', 'channel_evaluation', 'benchmark'
    )
  ),
  stage text null,
  provider text null check (provider in ('anthropic', 'google', 'fake')),
  model text null,

  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'stale', 'cancelled')),
  attempt integer not null default 1,

  idempotency_key text null,
  input_hash text null,
  base_artifact_version_id uuid null references artifact_versions(id),

  started_at timestamptz null,
  finished_at timestamptz null,

  error_code text null,
  error_message text null,
  retry_safe boolean not null default false,

  created_by uuid null references profiles(user_id),
  created_at timestamptz not null default now()
);

create index operation_runs_request_id_idx on operation_runs (request_id, created_at desc);

-- Active-run deduplication (SYSTEM-DESIGN-NEXTJS.md §27.1): a repeated click
-- for the same logical operation reuses/shows the run already in flight
-- instead of starting a duplicate provider call.
create unique index operation_runs_active_idempotency_unique
  on operation_runs (request_id, idempotency_key)
  where status in ('queued', 'running') and idempotency_key is not null;

alter table source_evidence
  add constraint source_evidence_source_analysis_run_id_fkey
  foreign key (source_analysis_run_id) references operation_runs(id);

alter table content_plans
  add constraint content_plans_created_by_operation_run_id_fkey
  foreign key (created_by_operation_run_id) references operation_runs(id);

alter table artifact_versions
  add constraint artifact_versions_operation_run_id_fkey
  foreign key (operation_run_id) references operation_runs(id);

alter table evaluations
  add constraint evaluations_operation_run_id_fkey
  foreign key (operation_run_id) references operation_runs(id);

-- ---------------------------------------------------------------------------
-- notification_attempts
-- ---------------------------------------------------------------------------

create table notification_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid null references content_requests(id) on delete cascade,

  channel text not null check (channel in ('content_manager', 'reviewer', 'system_errors')),
  event_type text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error text null,

  created_at timestamptz not null default now()
);

create index notification_attempts_request_id_idx on notification_attempts (request_id);

-- ---------------------------------------------------------------------------
-- error_logs
--
-- Durable record of unexpected system incidents, distinct from expected
-- domain/validation errors (SYSTEM-DESIGN-NEXTJS.md §26.3, §28.1).
-- ---------------------------------------------------------------------------

create table error_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid null references content_requests(id) on delete set null,

  stage text not null,
  error_code text null,
  message text not null,
  context jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index error_logs_request_id_idx on error_logs (request_id);
create index error_logs_created_at_idx on error_logs (created_at desc);
