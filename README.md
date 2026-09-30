# TestShift

Rent four AI QA agents by the hour. Customers paste a URL and book a free 20-minute trial or 1–8 hours. Dev, Staging, UAT and Prod agents (one Claude + Playwright tester working in four phases) test component behavior, integration, user journeys and smoke checks in a real browser. They deliver an evidence-based report and a Playwright suite of replayable assertions. URL-only testing is not source-level unit testing or a guarantee of finding every defect.

Full product context: [docs/PRODUCT_CONTEXT.md](docs/PRODUCT_CONTEXT.md). Plan and roadmap: [docs/PLAN.md](docs/PLAN.md).

Current hardening results and release limitations: [QA audit](docs/QA_AUDIT.md). Detailed test-generation/execution workflow and cost controls: [Agent workflow](docs/AGENT_WORKFLOW.md).

Current beta billing: [Wise onboarding and 10× hourly pricing](docs/BETA_BILLING.md). Stripe is parked. Paid orders require manual payment confirmation and a separate admin start.

Owner dashboard: set `ADMIN_PASSWORD` in `.env.local`, then open `/admin` to track Claude token usage, cost and margin.

## Stack

Next.js 16 (App Router) · Tailwind CSS v4 · Postgres (Supabase) · Playwright · Claude API (`@anthropic-ai/sdk`) · manual Wise payments · Resend (outgoing reports)

```
src/app/            pages: landing, /hire (booking), /runs/[id] (live shift + report), Stripe webhook
src/lib/            db client + types, plans & pricing, SSRF guard, Playwright spec export
worker/             long-running tester: crawl → plan → execute → report
supabase/migrations database schema
```

## Run it locally

1. Install:
   ```bash
   npm install
   npx playwright install chromium
   ```
2. Create a free Supabase project. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` (use the "Transaction pooler" string) and `ANTHROPIC_API_KEY`.
3. Create the tables:
   ```bash
   npm run db:migrate
   ```
4. Start the web app and the worker in two terminals:
   ```bash
   npm run dev
   npm run worker
   ```

Free trials queue automatically. Paid orders always wait for Wise payment confirmation and manual start in `/admin`, including local development. Set `SHIFT_MINUTES_PER_HOUR=2` only for development fixtures to make a booked hour last two minutes.

Publish each plan's estimated token cost per hour in `/admin`; the customer quote is exactly 10× that amount. No hourly benchmark is invented: unpublished plans accept quote requests. New-order prices are snapshotted and cannot change retroactively. Stripe keys are not required; leave `STRIPE_ENABLED=0`.

## Checks

```bash
npm run lint
npm run typecheck
npm run check
npm test
npm run build
npm run test:e2e
```

`npm run check` asserts the SSRF guard and the Playwright export.

`npm test` runs adversarial worker, database, assertion and budget regressions. Browser traffic in agent tests is locally fulfilled; model calls are mocked. `test:e2e` starts the production build with an in-memory PGlite database and disabled payment/email/model credentials. It never runs the customer worker. Do not set `QA_REUSE_SERVER=1` unless intentionally reusing that disposable test server. Chromium must be installed.

Optional paid synthetic-agent evaluation: `node --env-file-if-exists=.env.local --import tsx scripts/evaluate-agent.ts`. It uses the configured model credential, an estimated $0.30 ceiling, locally fulfilled browser fixtures, and no customer database. Results are saved under ignored `artifacts/qa/`. This is a small development evaluation, not a recall benchmark.

## Deploy

Apply pending migrations through `supabase/migrations/20261007000000_manual_beta_orders.sql` before deploying this web/worker revision. They add atomic limits, replay/timing fields, fixed quotes and payment/start authorization. These changes have only been applied to disposable test databases, not to production.

- **Web**: Vercel. Set the required variables from `.env.example` except `SHIFT_MINUTES_PER_HOUR`. Leave Stripe disabled for beta; no Stripe account/key/webhook is needed.
- **Worker**: any host that runs a long-lived container, such as Fly.io or Railway, using the `mcr.microsoft.com/playwright` base image. Run `npm run worker`, and restrict its network egress to the public internet. Run more copies to test more sites in parallel.

The worker additionally uses a DNS-pinning forward proxy. Keep the host firewall: the application proxy is not an OS/browser sandbox. AI spend defaults to $2 per trial and 10% of the paid order's fixed quote, based on configured token rates; provider billing caps remain necessary. For self-hosted web servers, configure `TRUST_PROXY_HEADERS` only behind an IP-header-overwriting proxy with direct origin access blocked.
