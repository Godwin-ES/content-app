-- Koya Content Studio (Week 4) — content packages and approval reviews
-- See ../../SYSTEM-DESIGN-NEXTJS.md §23, §24, §32 for the authoritative spec.

-- ---------------------------------------------------------------------------
-- content_packages
--
-- Each row is one immutable package version with exact references to every
-- reviewed public asset and applicable evaluation (SYSTEM-DESIGN-NEXTJS.md §23).
-- Only ever created by the create_content_package RPC (008_business_rpcs.sql).
-- ---------------------------------------------------------------------------

create table content_packages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references content_requests(id) on delete cascade,
  version_number integer not null,

  source_set_version_id uuid not null references source_set_versions(id),

  article_version_id uuid not null references artifact_versions(id),
  article_evaluation_id uuid not null references evaluations(id),
  linkedin_version_id uuid not null references artifact_versions(id),
  linkedin_evaluation_id uuid not null references evaluations(id),
  x_version_id uuid not null references artifact_versions(id),
  x_evaluation_id uuid not null references evaluations(id),
  newsletter_version_id uuid not null references artifact_versions(id),
  newsletter_evaluation_id uuid not null references evaluations(id),

  snapshot jsonb not null,
  snapshot_hash text not null,

  created_by uuid not null references profiles(user_id),
  created_at timestamptz not null default now(),

  unique (request_id, version_number)
);

create index content_packages_request_id_idx on content_packages (request_id);

alter table content_requests
  add constraint content_requests_current_package_id_fkey
  foreign key (current_package_id) references content_packages(id);

-- ---------------------------------------------------------------------------
-- approval_reviews
--
-- One row per review cycle. A resubmission creates a new row
-- (SYSTEM-DESIGN-NEXTJS.md §32.14). The partial unique index below is the
-- authoritative "one pending review per request" invariant (§33), enforced
-- again defensively inside submit_package_for_review.
-- ---------------------------------------------------------------------------

create table approval_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references content_requests(id) on delete cascade,
  package_id uuid not null references content_packages(id),

  status text not null default 'pending' check (
    status in ('pending', 'withdrawn', 'approved', 'changes_requested', 'rejected')
  ),

  submitted_by uuid not null references profiles(user_id),
  submitted_at timestamptz not null default now(),

  decided_by uuid null references profiles(user_id),
  decided_at timestamptz null,
  comment text null,

  created_at timestamptz not null default now()
);

create index approval_reviews_request_id_idx on approval_reviews (request_id, submitted_at desc);
create index approval_reviews_package_id_idx on approval_reviews (package_id);

create unique index approval_reviews_one_pending_per_request
  on approval_reviews (request_id)
  where status = 'pending';
