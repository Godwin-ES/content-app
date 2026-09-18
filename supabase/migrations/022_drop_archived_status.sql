-- Koya Content Studio (Week 4) — drop the 'archived' status.
--
-- Nothing has ever written it. It survived only because the dashboard had
-- an Archived tab that rendered it, and the tab survived because the status
-- existed — each justifying the other while no code path could produce
-- either. Deleting used to be permanent, so "archive" was the gentler thing
-- a request might one day have needed; now that deletion is a bin you can
-- restore from for 30 days, that need is met properly.
--
-- Verified against the live database before writing this: no row holds it.

alter table content_requests drop constraint if exists content_requests_status_check;
alter table content_requests add constraint content_requests_status_check check (
  status in ('draft', 'source_review', 'content_development', 'approved')
);
