# Fixture: Human Approval

Two ephemeral accounts:
- `approval-owner-*@koya-content-studio.test` — role `content_manager`
- `approval-reviewer-*@koya-content-studio.test` — role `reviewer`

One request, owned by the Content Manager account, carried through: selected article (passing evaluation) → all three channels generated (passing evaluations) → package created → submitted for review.

See `tests/integration/approval-workflow.test.ts`'s `fullyReadyRequest()` helper for the exact reproducible setup.
