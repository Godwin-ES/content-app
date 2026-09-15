# Koya Content Studio

An AI-assisted content research, editorial review, and publishing-preparation application for a marketing/content team, built for the Koya AI Automation Academy Week 4 project.

It takes a raw content idea or a set of source URLs, researches the topic, lets a Content Manager review the retrieved sources, produces an evidence-backed content plan and three article options, evaluates and (once, automatically) revises weak drafts, adapts the selected article into LinkedIn/X/newsletter versions, requires an independent Reviewer's approval of the *exact* submitted package, and only then allows the approved package's channels to enter an **internal publishing/scheduling queue**.

See `../SYSTEM-DESIGN-NEXTJS.md` and `../IMPLEMENTATION-PLAN-NEXTJS.md` in the parent folder for the full system design and build plan, and `../BUILD-NOTES-NEXTJS.md` for the evidence log of decisions, real bugs found, and residual risks accumulated while building it.

## The internal publishing boundary

**This application never posts to LinkedIn, X, or an email provider.** The authoritative Week 4 endpoint is an internal queue: an approved package's channels can be queued immediately or scheduled for a future time, rescheduled, or cancelled — but the only statuses that ever exist are `queued`, `scheduled`, and `cancelled`. There is deliberately no `published`/`delivered` state anywhere, because no external provider ever confirms one. This is an intentional scope boundary (SYSTEM-DESIGN-NEXTJS.md §4.1, §90), not a missing feature.

## Roles

- **Content Manager** — creates requests, reviews sources, generates/edits/selects content, creates and submits packages, manages the publishing queue. Cannot approve their own submissions.
- **Reviewer** — reviews the exact submitted package (read-only, "Reviewing Package vN · Exact submitted version") and decides Approve / Request Changes / Reject. Cannot rewrite submitted content, and cannot decide a review they submitted themselves.

Both roles are looked up from the signed-in user's `profiles` row server-side on every action — a role is never trusted from the client.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in real values — never commit .env.local
```

Required for the app to run at all: a Supabase project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), an Anthropic API key, and a Google (Gemini) API key. See `.env.example` for every variable and a short comment on each.

Apply migrations and generate types against your own Supabase project (uses the Transaction pooler connection string if your network can't reach the direct host — see `BUILD-NOTES-NEXTJS.md`):

```bash
supabase db push --db-url "$SUPABASE_DB_URL"
supabase gen types typescript --db-url "$SUPABASE_DB_URL" > lib/supabase/database.types.ts
```

Seed the two dedicated test accounts used by the E2E suite and manual acceptance testing:

```bash
pnpm seed:test-users
```

### Development server limitation in some sandboxed environments

In at least one development environment used while building this project, `next dev`'s HMR/WebSocket connection was blocked, so client components never hydrated (buttons appeared but did nothing). If you hit this, verify interactive features against a production build instead:

```bash
pnpm build && pnpm start
```

## Environment variables

See `.env.example` for the full list with inline comments. The load-bearing ones to understand:

| Variable | Purpose |
|---|---|
| `USE_FAKE_PROVIDERS` | When `true`, all AI/research calls go through deterministic in-memory fakes instead of real providers. Routine tests always use this; the app **refuses** to honor it when `NODE_ENV=production`, regardless of the value. |
| `ENABLE_AI_TEST_MODE` | When `true`, a request can be created with an explicit model choice (Gemini / Claude Haiku 4.5 / Claude Sonnet 5) and the Test & Benchmark workspace nav item appears. When `false`, the server ignores any client-supplied model choice and always uses `PRODUCTION_AI_MODEL`. |
| `PRODUCTION_AI_PROVIDER` / `PRODUCTION_AI_MODEL` | The model used whenever `ENABLE_AI_TEST_MODE=false` — the only model production traffic can ever reach. |
| `ENABLE_FAILURE_INJECTION` + `TEST_FAILURE_TOKEN` | Dev-only controlled failure fixtures (research/AI timeouts, malformed output, persistence/notification failures). The `/api/test/failure-mode` route 404s unless `NODE_ENV!==production`, this flag is `true`, **and** the request carries a matching `x-koya-test-token` header — all three, every time. |
| `DISCORD_*_WEBHOOK_URL` | Best-effort, optional. A missing webhook is a silent no-op; Discord is a transparency surface, never workflow authority. |

## Tests

```bash
pnpm check      # lint + typecheck + the full unit/integration suite (vitest)
pnpm test:e2e   # Playwright end-to-end suite (e2e/*.spec.ts)
pnpm build      # production build
```

The unit/integration suite (`tests/unit/`, `tests/integration/`, `tests/contract/`) runs entirely against `FakeAIProvider`/`FakeResearchProvider` plus a real hosted Supabase project (tests requiring real credentials skip themselves cleanly via `hasSupabaseCredentials()` if none are configured). The E2E suite (`e2e/`) exercises real browser flows against a running server, seeding its own ephemeral fixtures via the Supabase admin client and cleaning them up in `afterAll`.

To purge leftover ephemeral test fixtures at any time (safe to run repeatedly; never touches the two dedicated seeded accounts):

```bash
pnpm reset:test-data
```

## Manual acceptance test pack

`../content_test_pack/Koya_Content_Agent_Test_Pack.md` (repo root, alongside this `app/` folder) is the full manual acceptance pack: the eight required Week 4 test scenarios (Raw Idea Request, URL-Based Request, Research and Source Grounding, Evaluation and Revision Loop, Human Approval, Channel Formatting, Publishing/Scheduling, Failure Handling) plus every required edge case, each citing either a specific automated test (runnable via `pnpm test`) or a specific live screenshot in `content_test_pack/evidence/` — never a projected outcome dressed up as a result. Its own closing section names the handful of edge cases not yet exercised live, honestly, as a punch list rather than glossing over them.

## Project structure

- `lib/` — pure/business logic, organized by domain (`articles/`, `channels/`, `packages/`, `approvals/`, `publishing/`, `research/`, `grounding/`, `ai/`, `test-support/`, `sample-pack/`, `workspace/`) plus `repositories/` (thin Supabase query wrappers) and `domain/` (shared types/errors).
- `actions/` — Next.js Server Actions, one file per domain, thin wrappers around `lib/` that add auth/role checks and centralized error logging.
- `components/` — UI, mirroring the `lib/` domains plus `shared/` (status badges, empty states, error displays) and `ui/` (shadcn primitives).
- `app/` — routes. `(app)/` is the authenticated shell; `api/test/` is the one dev-only route (failure injection).
- `supabase/migrations/` — the full schema, RLS policies, and transactional business RPCs (package/approval/queue state transitions are enforced in Postgres, not just in application code).
- `tests/` — `unit/`, `integration/` (real Supabase), `contract/` (provider adapters against real external services), `fixtures/benchmark/` (frozen model-comparison scenarios).
- `e2e/` — Playwright specs plus `helpers.ts` for shared fixture-seeding.
- `scripts/` — `seed-test-users.ts`, `reset-test-data.ts` (see Tests above).
