# TestShift

Rent four AI QA agents by the hour. Customers paste a URL and book a free 20-minute trial or 1–8 hours. Dev, Staging, UAT and Prod agents (one Claude + Playwright tester working in four phases) run unit, integration, end-to-end and smoke tests in a real browser and deliver a bug report plus a runnable Playwright suite.

Full product context: [docs/PRODUCT_CONTEXT.md](docs/PRODUCT_CONTEXT.md). Plan and roadmap: [docs/PLAN.md](docs/PLAN.md).

Owner dashboard: set `ADMIN_PASSWORD` in `.env.local`, then open `/admin` to track Claude token usage, cost and margin.

## Stack

Next.js 16 (App Router) · Tailwind CSS v4 · Postgres (Supabase) · Playwright · Claude API (`@anthropic-ai/sdk`) · Stripe Checkout · Resend

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

Without Stripe keys (in dev only), bookings skip payment and are queued straight away. Set `SHIFT_MINUTES_PER_HOUR=2` to make a booked hour last two minutes while you try it.

To test payments locally, use Stripe test keys and run `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## Checks

```bash
npm run lint
npm run typecheck
npm run check
npm run build
```

`npm run check` asserts the SSRF guard and the Playwright export.

## Deploy

- **Web**: Vercel. Set every variable from `.env.example` except `SHIFT_MINUTES_PER_HOUR`. Add a Stripe webhook for `checkout.session.completed` pointing to `/api/stripe/webhook`.
- **Worker**: any host that runs a long-lived container, such as Fly.io or Railway, using the `mcr.microsoft.com/playwright` base image. Run `npm run worker`, and restrict its network egress to the public internet. Run more copies to test more sites in parallel.
