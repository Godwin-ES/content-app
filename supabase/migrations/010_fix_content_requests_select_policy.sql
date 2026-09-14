-- Koya Content Studio (Week 4) — fix a self-referential RLS policy bug on content_requests
--
-- content_requests_select_readable called request_readable_by_current_user(id),
-- which (via request_owned_by_current_user) re-queries content_requests itself
-- through a security-definer subquery. Postgres evaluates a SELECT policy's
-- USING clause against `INSERT ... RETURNING` rows too, and a subquery-based
-- self-reference to the very table being inserted into cannot see that row's
-- own not-yet-externally-visible insert within the same command. The
-- practical symptom: any owner-scoped `.insert(...).select()` on
-- content_requests failed with "new row violates row-level security policy",
-- even though the row and check were otherwise entirely correct — reproduced
-- and isolated via direct SQL/curl against the live project (see
-- ../../BUILD-NOTES-NEXTJS.md).
--
-- Fix: evaluate directly against the row's own columns (owner_id, status)
-- instead of round-tripping through a subquery on the same table. No other
-- table's SELECT policy has this shape — everywhere else, the readability
-- helper queries a *different*, already-committed table (content_requests),
-- not itself.

drop policy if exists content_requests_select_readable on content_requests;

create policy content_requests_select_readable on content_requests
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (
      current_role_is('reviewer')
      and (
        status = 'pending_approval'
        or exists (
          select 1 from approval_reviews ar
          where ar.request_id = content_requests.id and ar.decided_by = auth.uid()
        )
      )
    )
  );
