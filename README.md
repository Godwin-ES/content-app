# Koya Content Studio

An AI-assisted content research, editorial review, and publishing-preparation application, built for the Koya AI Automation Academy Week 4 project.

It takes a raw content idea or a set of source URLs, researches the topic, lets you review the retrieved sources, produces an evidence-backed content plan and three article options, evaluates and (once, automatically) revises weak drafts, adapts the selected article into LinkedIn/X/newsletter versions, requires a human's explicit approval of the *exact* assembled package, and only then allows the approved package's channels to enter an **internal publishing/scheduling queue**.

See `../SYSTEM-DESIGN-NEXTJS.md` and `../IMPLEMENTATION-PLAN-NEXTJS.md` in the parent folder for the full system design and build plan, and `../BUILD-NOTES-NEXTJS.md` for the evidence log of decisions, real bugs found, and residual risks accumulated while building it.

## The internal publishing boundary

**This application never posts to LinkedIn, X, or an email provider.** The authoritative Week 4 endpoint is an internal queue: an approved package's channels can be queued immediately or scheduled for a future time, rescheduled, or cancelled — but the only statuses that ever exist are `queued`, `scheduled`, and `cancelled`. There is deliberately no `published`/`delivered` state anywhere, because no external provider ever confirms one. This is an intentional scope boundary (SYSTEM-DESIGN-NEXTJS.md §4.1, §90), not a missing feature.

## Accounts

One account, one person. You sign up with an email and password or with Google, and you own everything you create: requests, sources, drafts, packages, approvals, and the publishing queue. There are no roles to assign and nobody to invite.

The app started with two — a Content Manager who wrote and a Reviewer who approved. Collapsing to one account removed the handover, not the gate: **nothing reaches the publishing queue until a human has read a specific package version and deliberately approved it**, and that approval is recorded against that version with its author and timestamp. There is no "request changes" counterpart, because rejecting your own work is just editing it — any edit starts a new version and returns the request to development, leaving the approved one untouched.

Every action re-reads who you are from `auth.uid()` server-side and checks ownership in RLS and in the security-definer RPCs. Nothing about identity is ever trusted from the client.

### Signing in with Google

The code path is in place (`/signup`, `/login` → `signInWithOAuth` → `/auth/callback`), but the Google provider has to be enabled on the Supabase project with a client ID and secret before it works — that is dashboard configuration, not code. Until it is, the button surfaces Supabase's own "provider is not enabled" message rather than failing silently.

### The dashboard

Three tabs: **In Progress**, **Published**, and **Deleted**. Deleting is a bin — a request can be restored for 30 days and is removed for good after that, including its uploaded files. Queued publishing items are cancelled when a request is binned, and are not un-cancelled by a restore: whether the content should go out again is a decision, not a side effect of undoing a delete.

### Notifications

Settings takes a Discord webhook URL, and notifications about your content go there — a package approved, research that found nothing covering your primary keyword, an unexpected error. Without one they fall back to the deployment's own `DISCORD_*` webhooks, which is right for a single operator and wrong for anyone else. The URL is validated against Discord's webhook endpoint in both the action and the RPC, because the server makes an outbound POST to whatever is stored.

### Channels

Settings holds one destination per channel: a LinkedIn profile or page, an X handle, and a newsletter list with its recipients. These are destinations, not OAuth connections — see the publishing boundary above. The publishing queue warns when something is queued for a channel with nowhere to go.

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
| `ALLOW_MODEL_SELECTION` | When `true`, a request can be created with an explicit model choice (Gemini / Claude Haiku 4.5 / Claude Sonnet 5). When `false`, the server ignores any client-supplied choice — including one stored earlier — and always uses `PRODUCTION_AI_MODEL`. |
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
- `actions/` — Next.js Server Actions, one file per domain, thin wrappers around `lib/` that add authentication checks and centralized error logging.
- `components/` — UI, mirroring the `lib/` domains plus `shared/` (status badges, empty states, error displays) and `ui/` (shadcn primitives).
- `app/` — routes. `(app)/` is the authenticated shell; `api/test/` is the one dev-only route (failure injection).
- `supabase/migrations/` — the full schema, RLS policies, and transactional business RPCs (package/approval/queue state transitions are enforced in Postgres, not just in application code).
- `tests/` — `unit/`, `integration/` (real Supabase), `contract/` (provider adapters against real external services), `fixtures/benchmark/` (frozen model-comparison scenarios).
- `e2e/` — Playwright specs plus `helpers.ts` for shared fixture-seeding.
- `scripts/` — `seed-test-users.ts`, `reset-test-data.ts` (see Tests above).
