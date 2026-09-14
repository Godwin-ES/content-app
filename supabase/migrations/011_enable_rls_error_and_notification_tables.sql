-- Koya Content Studio (Week 4) — enable RLS on error_logs and notification_attempts
--
-- 007_rls_policies.sql documented these as "no client policies at all —
-- written by trusted server code using the service role key only," but never
-- actually ran `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on them. Without
-- RLS enabled, Postgres does not restrict access at the row level at all:
-- the tables were reachable by the anon/authenticated PostgREST roles
-- through ordinary table grants, exposing durable error logs and
-- notification history to any signed-in (or, depending on default grants,
-- even unauthenticated) client. Caught via the security advisory surfaced
-- while debugging an unrelated RLS issue (see ../../BUILD-NOTES-NEXTJS.md).
--
-- Fix: enable RLS with zero policies, which denies all client access by
-- default while service-role writes (which bypass RLS entirely) continue to
-- work unchanged.

alter table error_logs enable row level security;
alter table notification_attempts enable row level security;
