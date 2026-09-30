# TestShift: full product context

A single reference for anyone joining the project, human or AI assistant. It covers what the product is, how it works end to end, where the code lives, what is done, and what is still open.

Last updated: 2026-09-30.

**Beta billing supersedes the historical pricing/Stripe sections below:** see [BETA_BILLING.md](BETA_BILLING.md). Paid orders are fixed quotes at 10× owner-approved estimated AI cost, paid manually through Wise (@haiderj23), onboarded at haiderjalaldressify@gmail.com, then separately confirmed and started in `/admin`. No hourly benchmark is invented from the short evaluation. Stripe is disabled by default; old `PLANS.rate` values are legacy budget fallbacks, not public beta prices.

Current hardening evidence and release gates: [QA_AUDIT.md](QA_AUDIT.md). Detailed implemented agent workflow and limits: [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md). Historical measurements below are not a new certification of this revision. The new QA-integrity migration has not been applied to production by this audit.

---

## 1. The product

**TestShift** is a working name, meaning "book a QA shift". The repository folder is `rentaqa`, and the name lives in one constant, `SITE.name` in `src/lib/plans.ts`.

**One line:** rent a team of four AI QA agents by the hour. The Dev, Staging, UAT and Prod agents run unit, integration, end-to-end and smoke tests on a website in a real browser, then deliver a bug report and a runnable Playwright suite.

**Who it's for**
- Founders and small teams shipping without a dedicated QA person.
- Agencies that need a test pass before handing a site to a client.
- Dev teams that want a second pair of eyes before a release.

**The four agents** (`src/lib/agents.ts`). In the backend they are one AI tester working the shift in four phases, run in this order:

| Agent | Environment | Test type | Share of shift | What it checks |
|---|---|---|---|---|
| Dev | Development | Unit tests | 30% | One unit at a time: a field's validation, a button, a link, a component's state |
| Staging | Staging | Integration tests | 25% | Parts working together: forms reach their confirmation, search feeds results, state survives reloads |
| UAT | User acceptance | End-to-end tests | 30% | Complete customer journeys with acceptance criteria; automated accessibility audit on Lead and up |
| Prod | Production | Smoke tests | 15% | Every page loads fast and error-free, critical paths work; go / no-go verdict |

The "unit tests" are **unit-level UI tests** done through the browser, because the tester only has a URL. Real unit tests against source code need a GitHub connection (roadmap). This is stated on the site's FAQ.

**What the customer gets at the end of a shift**
- A deterministic score over evaluated checks (no score when none ran), and No-go, Incomplete, Go with caution or Go. Coverage gaps cannot be reported as a clean release.
- A one-line verdict from each agent.
- Bugs ranked by severity, each tagged with its agent and test type, with steps, expected versus actual, and a screenshot.
- What works well, a fix-first list, and every test case grouped by agent.
- A Playwright `.spec.ts` with one `test.describe` block per agent (mobile tests nested inside).

**Not supported yet:** pages behind a login, unit tests against source code, entering payment details.

---

## 2. Pricing, models and business rules

Every plan runs all four agents (`src/lib/plans.ts`).

| Plan | Rate | Claude model | Effort | Adds |
|---|---|---|---|---|
| Junior QA | $30/h | Sonnet 5.5 | low | Core flows, desktop only |
| Senior QA | $50/h | Opus 5.5 | medium | Mobile viewport, edge cases and bad inputs |
| Lead QA | $100/h | Opus 5.5 | high | Accessibility audit (axe-core, WCAG 2 A/AA), performance audit (LCP and CLS) |
| Principal QA | $150/h | Fable 5.1 | medium | Security-header review, priority queue (claimed first) |
| Custom | Quote | — | — | Request form at `/custom`; requests appear in `/admin` |

- **Paid shifts:** 1, 2, 3, 4, 6 or 8 hours. Price = rate × hours, paid up front through Stripe Checkout.
- **Free trial:** one free 20-minute shift (`TRIAL_MINUTES`) per email address and per website.
  - Email matching ignores case, and website matching ignores `www.`.
  - Unique indexes in the database enforce this, so it holds even for parallel sign-ups.
  - It works on any plan and needs no card.
  - The trial report ends with "Book more hours".
- **Booking form:** the free trial is selected by default. No plan is selected unless the link includes `?plan=`. Customers must confirm they own the site or may test it.
- **Model prices** in USD per million tokens (input / output / cache read / cache write):
  - Sonnet 5.5: 2 / 10 / 0.20 / 2.50
  - Opus 5.5: 4 / 20 / 0.20 / 5
  - Fable 5.1: 10 / 50 / 0.25 / 12.50
- **Starting cost estimates** (used by the token calculator until real shifts exist): about $4, $9, $14 and $28 per shift-hour for Junior, Senior, Lead and Principal. Real averages replace them per plan as shifts complete.
- **Not built yet:** refunds for failed or early-ending shifts, and email verification.

---

## 3. Pages

| Route | What it is |
|---|---|
| `/` | Landing page, fully animated (see §10). Prerendered static HTML. |
| `/hire` | Booking form: URL, plan (four cards with model badges), shift length ("20 min free" or 1–8h), email, notes, permission. Accepts `?url=`, `?plan=` and `?hours=`. |
| `/custom` | Custom pricing quote request (name, email, company, website, needs), with a honeypot field for bots. |
| `/runs/[id]` | Private shift page (UUID link, `noindex`). While running: clock, progress bar, four-agent pipeline with the agent on duty, a live log tagged by agent, refreshing every 5s. When done: the full report. |
| `/runs/[id]/spec` | Playwright suite download, for completed shifts only. |
| `/runs/[id]/shots/[caseId]` | Screenshot of a failed test. |
| `/admin` | Owner-only dashboard: Claude token usage, cost, revenue, margin, token calculator, shifts, quote requests. |
| `/admin/login` | Password sign-in (`ADMIN_PASSWORD`). |
| `/api/stripe/webhook` | Stripe `checkout.session.completed` marks the shift paid. |

There are no customer accounts. The UUID link acts as a private link, and the email contains it.

---

## 4. How it works in the backend

```
Customer ─▶ Next.js 16 web app (Vercel) ───▶ Postgres (Supabase)
               │    │                              ▲
               │    └─ Stripe Checkout + webhook   │ claims runs (FOR UPDATE SKIP LOCKED, Principal first)
               │                                   │
               │                         Worker (Node + Playwright, long-running container)
               │                                   │
               └── shift page / report ◀───────────┼─▶ Claude API: plan · execute · report (usage logged per call)
                                                   └─▶ Resend (report-ready email)
```

### Step by step, from submitting a link
1. **Booking** (`src/app/hire/actions.ts`).
   - Zod validates every field. The URL is stored in normalised form (`new URL().href`); links with a username or password are refused, and the SSRF guard rejects private or internal hosts (`src/lib/net.ts`).
   - Rate limits (`src/lib/rateLimit.ts`, hashed IPs only): 20 bookings per IP per hour; 2 free trials per IP per day, counted from trials actually created; a global cap of `MAX_TRIALS_PER_DAY` trials (default 100).
   - **Trial:** one per mailbox (`emailKey`: case, `+tags` and Gmail dots ignored) and one per registrable domain (`siteKey`: `www.` and subdomains share one), enforced by unique indexes.
   - **Paid:** status `pending_payment`, then Stripe Checkout.
2. **Payment.** The signed webhook (`completed` or `async_payment_succeeded`) or the return page (only for the shift's own session id) calls the idempotent `markRunPaid`.
3. **Pickup** (`worker/index.ts`).
   - Paid Principal shifts go first, then oldest first; trials never jump the queue.
   - Each claim gets a fresh `claim_token`. Heartbeats check it; case/run writes lock and verify ownership transactionally. A lost claim closes the browser.
4. **Setup.**
   - Map the site: a breadth-first crawl records status, load time, issues and a **compact outline** (only headings, fields, buttons, links and short text).
   - **Test strategy:** one call lists the site's features (F1, F2, …) ranked by risk. All four agents plan against it, and the report shows feature coverage.
5. **Four agent phases** (windows start after setup, so it never eats an agent's time). For each agent:
   - Automated checks first: accessibility on UAT; smoke, Core Web Vitals and security headers on Prod. Third-party failures (analytics, ads) are noted, never counted as bugs. Login pages (401/403) are "blocked", not "failed".
   - The **planner** writes tests with an executable **script** (Playwright steps and assertions). Batch size scales with the time left, and no planning starts with under 30 seconds to go.
   - **Script-first execution:** each script runs in fresh browser storage with no model call. Passing requires browser assertions and no unresolved first-party runtime errors. Failures/no script invoke the bounded investigator. Assertion failures preserve their original trace and require an independent replay before confirmation. Unreproduced failures are inconclusive/blocked.
   - Errors are isolated: a failing test becomes "blocked", a failing planner retries once, and a failing agent doesn't stop the next one.
6. **Report** (low effort), completion (only if this worker still holds the claim), email.
7. **Export.** Performed actions become Playwright code, grouped by agent. Comment text is sanitised so nothing in a URL or model output can inject code; page-open-only checks are left out.

### How the tester saves tokens (`worker/ai.ts`)
- **Cached context:** rules + site map + strategy are one prefix, cached with `cache_control` (a 1-hour TTL on shifts of an hour or more). Every planning call after the first re-reads it at the cache price.
- **Compact site map:** it keeps only testable elements, and lists the header, nav and footer once instead of on every page.
- **Script-first:** in the verification runs, 45 of 49 passes needed no model call.
- **Low thinking for execution:** Sonnet 5.5 runs with `thinking: between_tools`; Opus 5.5 and Fable 5.1 run at effort `low`. The planner keeps the plan's effort, because test design is where quality comes from.
- **Batched browser steps:** the investigator can send up to 8 steps per call.
- Measured on the same 5-minute Junior shift on TodoMVC: **before**, 22 tests, 69 calls, $0.50; **after**, 53 tests, 29 calls, $0.31. That's 72% cheaper per test.

### Claude API usage
- `@anthropic-ai/sdk` via `client.beta.messages.create` / `.parse`, with bounded deadlines and output, no automatic SDK retries and no server-side fallback chain. Estimated per-run budgets gate every request; a deterministic report is available without AI.
- Every response's usage (input, output, cache read, cache write; 1-hour writes billed at 2× input) is saved to `ai_usage` with its cost.
- Page content and customer notes are data, never instructions. Notes can only set focus areas; they can't loosen the safety rules.

---

## 5. Admin dashboard (owner only)

- **Sign-in:**
  - Set `ADMIN_PASSWORD` in the environment. The dashboard is off while it's empty.
  - Password comparison is constant-time, and a failed attempt waits 800 ms.
  - The session cookie `ts_admin` is `<expiry>.<HMAC>`, httpOnly, SameSite=Strict, path `/admin`, valid for 12 hours. Changing the password signs everyone out.
- **Period switch:** last 7 days, last 30 days, or all time.
- **Totals:** tokens (input, output, cached), Claude cost, API calls, revenue from paid shifts (trials excluded), profit and margin.
- **Token calculator:** pick a plan, hours per shift and shifts per month. It shows tokens, Claude cost, revenue and profit per shift and per month, using real averages from completed shifts per plan (estimates until then).
- **Tables:** usage by model, by agent (including the report writer) and by day; recent shifts with tokens, cost and revenue; custom pricing requests with reply-by-email links.

---

## 6. Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 16.3 (App Router, Turbopack, React Compiler), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 + design tokens and motion in `globals.css` (no component library) |
| 3D | three.js, loaded lazily after the page is interactive |
| Fonts | Unbounded (display), Familjen Grotesk (body), JetBrains Mono (data), via `next/font` |
| Validation | Zod v4 |
| Database | Supabase Postgres via `postgres` (postgres.js, `prepare: false` for the pooler) |
| Browser automation | Playwright (Chromium), axe-core for accessibility |
| AI | Claude API (`@anthropic-ai/sdk`): Sonnet 5.5, Opus 5.5, Fable 5.1 |
| Payments / email | Stripe Checkout / Resend (plain HTTP) |
| Worker runtime | Node 24 + `tsx` |

---

## 7. Code map

```
src/app/
  page.tsx                  landing page (composes the sections below + FAQ, CTA, footer)
  _landing/                 Hero, ShiftHud, Ticker, Pipeline, Consoles, ReportStack, Pricing, samples.ts
  layout.tsx, globals.css   fonts, PipelineScene backdrop, colour tokens, all motion
  error.tsx                 friendly error page
  hire/                     booking page, form (plans, trial/hours), server action
  custom/                   custom pricing page, form, server action
  runs/[id]/                page, LiveShift, AgentPipeline, Report, RunControls, spec + screenshot routes
  admin/                    dashboard page, data.ts (queries), TokenCalculator, login/, actions.ts
  api/stripe/webhook/       Stripe webhook
src/components/
  Logo.tsx                  animated mark + wordmark
  SiteHeader.tsx, UrlForm.tsx, SplitText.tsx, ShiftLog.tsx
  scene/PipelineScene.tsx   canvas, lazy three.js loader, section → stage observer, StageSync
  scene/scene.ts            the three.js scene (cores, pipeline, packets, camera shots)
src/lib/
  agents.ts                 AGENTS, agentWindows()
  plans.ts                  SITE, MODELS (prices), PLANS, HOUR_OPTIONS, TRIAL_MINUTES, tokenCost()
  db.ts                     postgres client, json(), isUuid, data types
  admin.ts                  admin session (password check, signed cookie)
  net.ts                    SSRF guard      spec.ts  Playwright export      payments.ts  Stripe
  log.ts                    structured JSON logging
worker/
  index.ts                  claim loop, site map, four agent phases, automated checks, report, email
  browser.ts                context + SSRF routing, page watcher, actions, crawler, auditPages, accessibilityAudit
  ai.ts                     per-plan model, usage recording, planner per agent, executor, report writer
scripts/                    migrate.ts, selfcheck.ts
supabase/migrations/        init · free_trial · agents_plans_usage
```

---

## 8. Data model

**`runs`**
- `url`, `email`, `plan` (junior | senior | lead | principal), `minutes` (1–480), `is_trial`, `notes`
- `status` (pending_payment → queued → running → completed | failed)
- `agent` (on duty), `activity`, `stripe_session_id`, `site_map`, `report` (including `agentNotes`), `error`
- Timestamps: `started_at`, `deadline_at`, `heartbeat_at`, `completed_at`, `created_at`, `updated_at`
- Constraints: a trial is 20 minutes or less; one trial per `lower(email)`; one trial per host (`www.` ignored).

**`test_cases`**
- `agent` (dev | staging | uat | prod; this sets the test type), `seq`, `title`
- `category` (smoke | functional | e2e | negative | ui | accessibility | performance | security), `priority`, `viewport`
- `start_url`, `steps`, `expected`, `status`, `actual`, `severity`, `actions` (for the export), `failure_assertion`, `scripted`, `screenshot`, `finished_at`

**`ai_usage`** (append-only): `run_id`, `agent` (null for the report writer), `purpose` (plan | execute | report), `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `cost_usd`, `created_at`.

**`custom_requests`**: `name`, `email`, `company`, `website`, `message`, `status` (new | contacted | closed), timestamps.

RLS is enabled on all tables with no policies. Only the server's `DATABASE_URL` can read them.

---

## 9. Configuration and running

`.env.local` (template in `.env.example`):

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | web + worker | Supabase Transaction pooler, URL-encoded password |
| `ANTHROPIC_API_KEY` | worker | Required |
| `APP_URL` | web + worker | Redirects and email links |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | web | Empty in dev means payment is skipped |
| `RESEND_API_KEY`, `EMAIL_FROM` | worker | Optional |
| `ADMIN_PASSWORD` | web | Turns on `/admin` |
| `SHIFT_MINUTES_PER_HOUR` | worker | Dev only: shortens shifts |

**Supabase project:** `ulvyxohdjkuluhhlecdz` (ap-southeast-1).
- Pooler: `aws-0-ap-southeast-1.pooler.supabase.com:6543`.
- Historical deployment state is not authoritative; verify applied migrations. The audit's `20261006000000_qa_integrity.sql` is tested locally but not applied to production.
- The Supabase connector in Claude Code is linked to a *different* project (`pmbatptoffscqtnfmhbz`, PeptoLogics). Don't use it for TestShift.

```bash
npm install
npx playwright install chromium
npm run db:migrate
npm run dev            # web app
npm run worker         # AI tester, second terminal
npm run lint && npm run typecheck && npm run check && npm run build
```

**Deploy:**
- Web on Vercel.
- Worker as a long-running container using the `mcr.microsoft.com/playwright` image, with outbound network restricted to the public internet. Scale by adding copies.

**Git:**
- Remote: `git@github-personal:haiderjalal/testshift.git`.
- `main` holds the starter project; `feature/mvp` has the app.

---

## 10. Design language and motion

- **Theme: a dark test lab.** Colours (tokens in `globals.css`):
  - Paper `#05070d`, card `#0a0f1c`, ink `#e8edf6`, graphite `#8e99ae`.
  - Agents: Dev cyan `#45d4ff`, Staging violet `#a07cff`, UAT pink `#ff6fd1`, Prod orange `#ff9f43`.
  - Status: marker yellow `#ffe45c` for bugs, pass `#3ddc97`, fail `#ff5470`.
- **3D scene** (`scene.ts`), a fixed backdrop on every page except `/admin`:
  - Four agent cores (icosahedron, octahedron, torus knot, dodecahedron), each with a wire shell, orbit ring, halo and coloured light.
  - A colour-blended pipeline with test packets flowing along it, drifting dust, and a grid floor.
  - The camera follows `<html data-stage>`: sections marked `data-stage` set it as you scroll, and the live shift page sets it to the agent on duty.
  - It dims in text-heavy sections and on phones, and holds still under reduced motion.
- **Logo:** the hexagon draws itself, the check follows, and four agent nodes pulse in pipeline order. "Shift" slides in letter by letter, and a light sweep passes every 6 seconds. Hover replays it.
- **Landing motion:**
  - Headline characters rise in, with a ticking sample-shift readout.
  - An endless ticker of sample checks.
  - Pinned agent panels with a rail that fills as you scroll and a sticky stepper that follows the section.
  - Four typing consoles, an exploding 3D report stack, and a score that counts up on scroll.
  - Pricing cards tilt in, with rotating four-colour borders.
- **Everywhere:** CSS scroll-driven animations with no JavaScript (Firefox shows the final state), and `prefers-reduced-motion` stops all motion.

---

## 11. Security and safety

- **Input:**
  - Zod validation on the server, backed by database constraints.
  - The URL is normalised and has no credentials.
  - `Object.hasOwn` guards query parameters, so `?plan=constructor` can't create NaN prices.
- **SSRF** (the worker opens customer-supplied URLs):
  - Requests to private or reserved addresses are aborted. That includes IPv6, NAT64, 6to4, carrier-grade NAT and multicast ranges, with a 30-second DNS cache.
  - Top-level navigation off the booked site is aborted.
  - WebSockets are checked, and service workers are blocked.
  - A local forward proxy validates DNS and connects to the same public IP, including HTTP and HTTPS CONNECT. Private destinations are refused before contact, protecting against blind redirect/rebinding requests that browser response checks alone cannot prevent.
  - Response-IP taint checks remain as defense in depth; only the registered loopback proxy endpoint is exempt. A real private sentinel received zero requests in the current regression tests.
  - Production workers still require a public-only egress firewall and isolated browser containers. This is not an audited OS-level sandbox.
- **Abuse:**
  - Rate limits on bookings, trials, quote requests and admin sign-in.
  - A global daily trial cap.
  - One trial per mailbox and per domain.
  - Trial count/insert and rate-limit counters are atomic. Hosted tenants are separated using the public suffix list. Forwarded IP headers are trusted only on Vercel or explicitly configured trusted-proxy deployments.
- **Payments:** the webhook signature is verified, `markRunPaid` is idempotent, and the return-page check only uses the shift's own session.
- **Admin:**
  - `ADMIN_PASSWORD` must be at least 16 characters.
  - The session cookie is signed with a scrypt-derived key, not the password. It's httpOnly, SameSite=Strict, path `/admin` and expires after 12 hours.
  - Sign-in is limited to 10 attempts per IP per 15 minutes.
- **Output:**
  - React escaping everywhere.
  - Playwright export comments strip all JavaScript line terminators, including U+2028 and U+2029.
  - Email subjects are single-line, and logs never contain names or subjects.
- **Headers:** CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`), X-Frame-Options, nosniff, Referrer-Policy (`no-referrer` on `/runs`), HSTS and Permissions-Policy, with `X-Powered-By` removed.
- `npm run check` asserts the SSRF ranges, the injection defence, trial keys, token costs, agent windows and the export.

## 12. Status

**Historical verification** (2026-09-30; see QA_AUDIT.md for the current revision):
- The landing page on desktop and mobile. A headless tour confirmed each section drives the 3D camera, WebGL loads and there are no console errors.
- The live shift page with the agent pipeline, and the report with the verdict, agent notes and grouped cases.
- The Playwright export grouped by agent.
- The booking form with four plans.
- The custom quote form submitting.
- The admin sign-in (wrong password rejected, secure cookie) and the dashboard showing usage, cost and requests.
- The free-trial rules: normalised URLs, `www.` and `+tag` duplicates refused, and the per-IP limit counted on real trials.
- Security headers, crafted query parameters, the redirect-to-private SSRF guard (live test), and the WebSocket and off-site blocks.
- **Real AI shifts:**
  - Junior (Sonnet 5.5) on TodoMVC: 53 tests, $0.31 for 5 minutes.
  - Senior (Opus 5.5) on the-internet.herokuapp.com: it found the real HTTP 500 bugs, correctly blocked 401 pages, and third-party noise was no longer reported. About $0.46 for 5 minutes.
  - All three models respond, and token logging works.
- Lint, typecheck, self-check and the production build.

**Not yet verified:**
- Fable 5.1 (Principal) in a full shift; only its API access was checked.
- Stripe with test keys, and Resend delivery to customers (that needs a verified domain).
- Behaviour on large real sites with logins, cookie walls and heavy JavaScript.

---

## 13. Roadmap and open decisions

**Before charging real customers:**
- Refunds or credit for failed shifts and unused time.
- Screenshots in Supabase Storage instead of the database.
- Booking rate limits.
- Terms of service.
- Measure real AI cost per plan and tune effort.
- Admin actions: mark quote requests contacted, refund, retry.

**Later:**
- Logged-in testing.
- Real unit tests via GitHub.
- Scheduled regression shifts.
- Customer accounts.
- Video of failed tests.
- Cross-browser runs (Firefox, WebKit).

**Open decisions for the owner:**
- Final name and domain.
- Whether trials should be limited to Junior, to cap AI cost.
- Whether shifts that run out of tests should end early with credit.
