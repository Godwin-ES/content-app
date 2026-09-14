-- Koya Content Studio (Week 4) — internal publishing/scheduling queue
-- See ../../SYSTEM-DESIGN-NEXTJS.md §25, §32 for the authoritative spec.
--
-- Statuses are only queued/scheduled/cancelled. There is no "published"
-- state: this queue is the Week 4 publishing boundary and never claims an
-- external platform actually received the content (SYSTEM-DESIGN-NEXTJS.md §4.1, §25.1).

create table publishing_queue_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references content_packages(id),
  request_id uuid not null references content_requests(id) on delete cascade,

  channel text not null check (channel in ('linkedin', 'x', 'newsletter')),
  channel_artifact_version_id uuid not null references artifact_versions(id),

  status text not null default 'queued' check (status in ('queued', 'scheduled', 'cancelled')),
  scheduled_at timestamptz null,
  timezone text null,

  -- Supports safe retry of an uncertain queue-write outcome (SYSTEM-DESIGN-NEXTJS.md §27.1, §25.4):
  -- before retrying, the caller re-reads by this key rather than blindly inserting again.
  idempotency_key text not null unique,

  created_by uuid not null references profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index publishing_queue_items_request_id_idx on publishing_queue_items (request_id);
create index publishing_queue_items_package_id_idx on publishing_queue_items (package_id);

-- One active (queued/scheduled) item per package/channel (SYSTEM-DESIGN-NEXTJS.md §25.4, §33).
create unique index publishing_queue_active_unique
  on publishing_queue_items (package_id, channel)
  where status in ('queued', 'scheduled');

create trigger publishing_queue_items_set_updated_at
  before update on publishing_queue_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- publishing_events (append-only)
-- ---------------------------------------------------------------------------

create table publishing_events (
  id uuid primary key default gen_random_uuid(),
  queue_item_id uuid not null references publishing_queue_items(id) on delete cascade,

  event_type text not null check (event_type in ('created', 'scheduled', 'rescheduled', 'cancelled')),
  actor_id uuid null references profiles(user_id),
  reason text null,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index publishing_events_queue_item_id_idx on publishing_events (queue_item_id, created_at);
