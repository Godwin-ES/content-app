# Koya Content Studio

An AI-assisted content research, writing, review, and publishing-preparation application built for the Koya AI Automation Academy Week 4 project.

A content request moves from a raw idea and optional source material through research, source review, evidence-backed planning, article generation, channel adaptation, human approval, and an internal publishing/scheduling queue.

## Product structure

- **Dashboard** — create content requests, track progress, reopen previous work, and manage deleted requests.
- **Research** — search the web or use supplied URLs/files, review retrieved sources and evidence, resolve conflicts, and confirm the source set used for writing.
- **Content development** — build an evidence-backed content plan, generate three article options, evaluate and revise drafts, and select the preferred article.
- **Channels** — adapt the selected article for LinkedIn, X, and email newsletter while preserving the grounding of the approved source material.
- **Package & approval** — assemble the exact article and channel versions into a reviewable package before they become eligible for scheduling.
- **Publishing queue** — queue, schedule, reschedule, or cancel approved channel content inside the application.

Content, source sets, evaluations, and packages are versioned so later edits do not silently change previously reviewed work. The application also keeps factual generation grounded in reviewed evidence rather than relying on model memory for substantive claims.

## Tech stack

- **Next.js 16** + React 19 + TypeScript
- **Tailwind CSS** + shadcn/ui
- **Supabase** — Postgres, Auth, Storage, RLS, and database-enforced workflow transitions
- **Claude** via the Anthropic SDK for planning, generation, evaluation, and revision
- **Firecrawl** for web research and retrieval
- **Vitest** for unit/integration tests and **Playwright** for end-to-end testing

## Local setup

Requires Node.js 22+ and pnpm.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

3. Configure the required Supabase, Anthropic, and Firecrawl credentials in `.env.local`.

4. Apply the migrations in `supabase/migrations/` to your Supabase project.

5. Start the development server:

   ```bash
   pnpm dev
   ```

6. Open <http://localhost:3000>.

## Tests

```bash
pnpm test        # unit + integration tests
pnpm test:e2e    # Playwright end-to-end tests
pnpm check       # lint + typecheck + unit/integration tests
pnpm build       # production build
```

## Publishing boundary

Koya Content Studio prepares and schedules approved content inside its own queue. It does **not** post directly to LinkedIn, X, or an email provider, so the application does not claim external delivery or publication that it cannot verify.
