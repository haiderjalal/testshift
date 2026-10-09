# TestShift: product plan

Working name **TestShift**, for "book a QA shift". Other options: *QA on Call*, *Hourglass QA*, *Rentaqa*.
The name lives in one constant (`SITE.name` in `src/lib/plans.ts`). Check domain and trademark availability before launch.

## The product in one line

Rent an AI QA engineer by the hour. Paste a link, book hours, and get a bug report plus a test suite when the shift ends.

## Who it's for

- Founders and small teams shipping without a dedicated QA person.
- Agencies that need a test pass before handing a site to a client.
- Dev teams that want a second pair of eyes before a release.

## Customer journey

1. **Landing page**: paste a URL and press "Book a shift".
2. **Book** (`/hire`): choose a plan and 1–8 hours, enter an email and optional focus notes, confirm permission to test, then pay with Stripe Checkout.
3. **Live shift** (`/runs/:id`): a private page with a shift clock, progress bar, and a live log of every test as it finishes.
4. **Report** (same page): quality score, summary, bugs ranked by severity with repro steps and screenshots, strengths, fix-first list, and every test case. The customer can download the Playwright suite or save the page as a PDF.
5. **Email**: "your report is ready", with the link.

## Pricing

Every plan runs all four agents: Dev (unit tests), Staging (integration), UAT (end-to-end) and Prod (smoke and release checks).

| Plan | Rate | Model | Adds |
|---|---|---|---|
| Junior QA | $30/h | Claude Sonnet 5.5, low effort | Core flows, desktop |
| Senior QA | $50/h | Claude Opus 5.5, medium effort | Mobile, edge cases and bad inputs |
| Lead QA | $100/h | Claude Opus 5.5, high effort | Accessibility and performance audits |
| Principal QA | $150/h | Claude Fable 5.1 | Security-header review, priority queue |
| Custom | Quote | — | Request form; requests show in the admin dashboard |

**Free trial:** every customer's first shift is 20 minutes, free, with no card needed. It is limited to one per email address and one per website (`www.` ignored), enforced by unique indexes in the database. The trial report ends with a "Book more hours" prompt that pre-fills the form.

**Cost tracking:** every Claude call's tokens and cost are logged to `ai_usage`. The owner-only `/admin` dashboard shows usage by model, agent and day, revenue against cost, and a calculator based on real averages. Starting estimates are roughly $4, $9, $14 and $28 per shift-hour for the four plans. Measure real costs on the first shifts before changing prices.

Full, current detail lives in [PRODUCT_CONTEXT.md](PRODUCT_CONTEXT.md).

## How the AI tester works (worker)

A shift has a hard deadline: `started_at + booked hours`. The worker:

1. **Explores** (up to 15% of the shift, 25 pages). It crawls same-origin links and records status, load time, console errors, failed requests, and an accessibility outline of each page.
2. **Smoke-tests** every page from that data. No AI is needed for this step.
3. **Plans** 8–12 test cases at a time with Claude, using the site map, the plan's focus, the customer's notes, and what has already been tested.
4. **Executes** each case in a fresh Chromium context (desktop or mobile). Claude drives a small browser tool (goto, click, fill, press, select, hover, and `expect_*` assertions) and reads the page's accessibility tree after every step. It then calls `finish` with passed, failed, or blocked, plus a severity. Failures get a screenshot.
5. **Loops** back to step 3 until the deadline, going deeper each round (follow-ups on failures, edge cases).
6. **Reports**: Claude writes the score, summary, strengths, and recommendations. The recorded actions become a Playwright spec.

Crash safety: a heartbeat every 30s. A run with a stale heartbeat is re-claimed and resumes from its saved site map and test cases.

## Architecture

```
Customer ─▶ Next.js 16 (Vercel) ──▶ Postgres (Supabase)
               │   │                     ▲
               │   └─ Stripe Checkout    │ claims runs (FOR UPDATE SKIP LOCKED)
               │      + webhook          │
               │                  Worker (Node + Playwright, Docker on Fly.io / Railway)
               │                         │
               └───── report page ◀──────┼─▶ Claude API (plan · execute · report)
                                         └─▶ Resend (report email)
```

- **Why a separate worker?** A shift runs for hours in a real browser, which is far beyond serverless limits. The worker is a plain long-running process: one shift per process, so scale by adding processes.
- **Why Postgres as the queue?** One fewer moving part. `SKIP LOCKED` makes multiple workers safe.
- **No customer accounts in v1.** The run page URL contains an unguessable UUID and works as a private link. It is marked `noindex`.

## Data model

- `runs`: one booked shift: URL, email, plan, hours, status (`pending_payment → queued → running → completed | failed`), live activity, deadline, heartbeat, site map, and report.
- `test_cases`: belong to a run: title, category, priority, viewport, steps, expected, status, actual, severity, recorded actions, and screenshot.

The schema is in `supabase/migrations/`. RLS is on with no policies, so Supabase's public API can't read customer data.

## Safety and trust

- Every input is validated with Zod on the server, and again by database constraints.
- **SSRF guard**: private and loopback IPs are rejected at booking and blocked for every browser request. Production workers must also run with egress restricted to the public internet.
- The customer must confirm they own, or have permission to test, the site.
- The tester uses obvious test data, never enters card details, and avoids destructive actions unless the notes allow them. Page content is treated as data, not instructions (prompt-injection hygiene).
- A server-side model fallback (`fallbacks: "default"`) keeps a shift running if a request is declined.
- The worker refuses to start without a Claude key, so paid shifts are never burned.

## Roadmap

**v1 (built):** landing page, booking with Stripe, live shift page, crawler and smoke tests, AI test planning and execution, report, Playwright export, email.

**v1.1: before charging real customers**
- Refunds or credit for unused time and failed shifts (Stripe refunds API).
- Admin view: all runs, cost per run, retry or refund.
- Store screenshots in Supabase Storage instead of the database.
- Rate-limit bookings per IP and email.
- Terms of service and an acceptable-use policy (testing only sites you control).

**v2: bigger value**
- **Logged-in testing**: encrypted test credentials, or a recorded login step.
- **Unit tests**: GitHub App connections and execution of reviewed suites in GitHub-hosted Actions are implemented; see [GitHub setup](GITHUB_TESTING.md). AI-written source tests, managed application provisioning and opt-in pull request creation remain future work.
- **Regression shifts**: re-run the exported suite on a schedule or on each deploy, and bill per run.
- Customer accounts and teams, shift history, and comparisons between shifts.
- Video recording of each failed test.

## Risks

| Risk | Mitigation |
|---|---|
| Model cost per hour higher than expected | Log usage per run, cap steps per case, tune effort per plan |
| False bug reports | Assertions must pass or fail in the browser, selector errors are not bugs, and a human review option can be added |
| Abuse (testing other people's sites) | Consent checkbox, ToS, rate limits, and single-threaded load per shift |
| Sites with CAPTCHAs or bot protection | Tests are marked "blocked" with the reason; allowlisting instructions for customers |
