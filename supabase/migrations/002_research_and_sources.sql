-- Koya Content Studio (Week 4) — supporting materials, research sources, and source sets
-- See ../../SYSTEM-DESIGN-NEXTJS.md §8, §9, §10, §32 for the authoritative spec.

-- ---------------------------------------------------------------------------
-- supporting_materials
-- ---------------------------------------------------------------------------

create table supporting_materials (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references content_requests(id) on delete cascade,

  filename text not null,
  mime_type text not null,
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),

  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'ready', 'failed')),
  extracted_text text null,
  content_hash text null,
  extraction_error text null,

  classification text not null default 'internal' check (classification in ('public', 'internal')),

  created_by uuid not null references profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index supporting_materials_request_id_idx on supporting_materials (request_id);

create trigger supporting_materials_set_updated_at
  before update on supporting_materials
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- research_sources
--
-- One row is the exact retrieved snapshot inspected by the system
-- (SYSTEM-DESIGN-NEXTJS.md §9.6). Refreshing a source creates a new row
-- (superseded_by_source_id) rather than mutating existing evidence.
-- ---------------------------------------------------------------------------

create table research_sources (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references content_requests(id) on delete cascade,

  origin text not null check (origin in ('researched', 'user_url', 'uploaded_material')),
  supporting_material_id uuid null references supporting_materials(id),

  original_url text null,
  canonical_url text null,
  title text null,
  publisher text null,
  author text null,
  published_at date null,

  retrieved_at timestamptz null,
  retrieval_status text not null default 'pending' check (
    retrieval_status in ('pending', 'usable', 'unusable', 'failed')
  ),
  retrieval_error text null,

  content_hash text null,
  extracted_text text null,

  superseded_by_source_id uuid null references research_sources(id),

  created_at timestamptz not null default now()
);

create index research_sources_request_id_idx on research_sources (request_id);
create index research_sources_retrieval_status_idx on research_sources (retrieval_status);

-- ---------------------------------------------------------------------------
-- source_evidence
-- ---------------------------------------------------------------------------

create table source_evidence (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references research_sources(id) on delete cascade,

  evidence_key text not null,
  excerpt text not null,
  conservative_summary text not null,
  supports jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,

  -- FK to operation_runs added in 004_operations_activity_errors.sql once that table exists.
  source_analysis_run_id uuid null,

  created_at timestamptz not null default now(),
  unique (source_id, evidence_key)
);

create index source_evidence_source_id_idx on source_evidence (source_id);

-- ---------------------------------------------------------------------------
-- source_review_decisions (append-only)
-- ---------------------------------------------------------------------------

create table source_review_decisions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references research_sources(id) on delete cascade,

  decision text not null check (decision in ('accepted', 'excluded')),
  reason text null,

  decided_by uuid not null references profiles(user_id),
  created_at timestamptz not null default now()
);

create index source_review_decisions_source_id_idx on source_review_decisions (source_id, created_at desc);

-- ---------------------------------------------------------------------------
-- source_conflicts
-- ---------------------------------------------------------------------------

create table source_conflicts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references content_requests(id) on delete cascade,

  source_a_id uuid not null references research_sources(id),
  source_b_id uuid not null references research_sources(id),
  description text not null,

  resolution text null check (resolution in ('prefer_source_a', 'prefer_source_b', 'present_both', 'avoid_claim')),
  resolution_note text null,
  resolved_by uuid null references profiles(user_id),
  resolved_at timestamptz null,

  created_at timestamptz not null default now()
);

create index source_conflicts_request_id_idx on source_conflicts (request_id);

-- ---------------------------------------------------------------------------
-- source_set_versions / source_set_items
--
-- Immutable confirmed evidence sets (SYSTEM-DESIGN-NEXTJS.md §10.6). Rows are
-- only ever created by the confirm_source_set RPC (008_business_rpcs.sql).
-- ---------------------------------------------------------------------------

create table source_set_versions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references content_requests(id) on delete cascade,
  version_number integer not null,

  confirmed_by uuid not null references profiles(user_id),
  created_at timestamptz not null default now(),

  unique (request_id, version_number)
);

create table source_set_items (
  id uuid primary key default gen_random_uuid(),
  source_set_version_id uuid not null references source_set_versions(id) on delete cascade,
  source_id uuid not null references research_sources(id),

  unique (source_set_version_id, source_id)
);

create index source_set_items_version_id_idx on source_set_items (source_set_version_id);

alter table content_requests
  add constraint content_requests_current_source_set_id_fkey
  foreign key (current_source_set_id) references source_set_versions(id);
