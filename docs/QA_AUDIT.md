# TestShift adversarial QA and hardening audit

Date: 2026-09-30. Scope: local repository, disposable database/browser fixtures and a capped live-model evaluation. No production migrations, deployments, customer-site destructive requests, emails or purchases were performed.

## Executive assessment

The product is an hourly, URL-only browser QA service: one Claude/Playwright worker runs four named testing phases and returns a report plus replayable checks. The most serious quality risk was **false confidence**: model-only pass verdicts, incomplete coverage appearing clean, and scripts which failed to preserve the actual bug.

This revision hardens those paths and adds repeatable regressions. It is **not production certification**. Authenticated testing, safe mutation policies, real deployment capacity, provider integration and broad defect-recall evaluation remain release work. No finite suite can establish that the product or a client site is bug-free.

## Findings addressed

| Priority | Observed weakness | Change and evidence |
|---|---|---|
| High | Model could finish “passed” without executing an assertion | Runtime requires a final assertion and no unresolved failure; hostile mock-model regression |
| High | HTTP 401/500 pages could pass when expected text existed | Access/rate-limited pages blocked; application HTTP errors fail; browser fixtures cover both |
| High | Blank URL and substring text/URL checks could pass the wrong state | Non-empty exact URL checks; exact text, including selector-scoped checks; wrong-result and metacharacter fixtures |
| High | Investigation could erase the original failing state | Original failure prefix retained; fresh replay required; reproducing, flaky and changed-state regressions |
| High | Reload could hide unchecked bad state | Planner rejects unchecked mutations before explicit reload/back/goto; live negative-quantity example now caught |
| High | Browser response-only SSRF defense still allowed blind private contact | DNS-pinned HTTP/CONNECT proxy; private sentinel received zero requests across decimal/hex/IPv6/localhost probes |
| High | Concurrent trial/rate checks could over-admit | Atomic UPSERT limiter and advisory-lock trial reservation transaction; burst/rollback tests |
| High | Stale workers could still write test results | Transactional claim fencing for run/case writes; stale, completed and rollback tests; browser closes on claim loss |
| High | A manually created beta order could start before Wise payment was verified | Database-enforced quote/payment/start gates, exact 10× quote snapshots, unique receipt references and separate authenticated admin confirmation/start actions |
| High | Missing/blocked checks inflated confidence | Completed-only coverage, deterministic score, explicit Incomplete verdict; empty-report browser regression |
| Medium | Failed assertions missing from exported suites; assertion-free tests exported | Persist failure assertion and exact original trace; omit non-replayable observations; export regressions |
| Medium | Unbounded model spending/retries/context growth | Per-run reservation budget, timeouts, smaller task-specific outputs, bounded history and retries, deterministic fallback report |
| Medium | Site heuristic conflated separate hosted tenants | Public suffix list with private domains; exact-origin browser scope; tenant separation tests |
| Medium | Self-hosted IP limits trusted spoofable headers by default | Explicit trusted-proxy opt-in; malformed/IPv6 key tests; shared fail-closed bucket otherwise |
| Medium | Malformed Unicode admin cookie could throw | Strict token syntax and expiry validation before constant-time comparison; unit and product regression |
| Medium | Native validity/checked/count/enabled states unavailable to the planner | Typed browser assertions and matching export support; real Chromium checks |
| Medium | Repeated/oversized planning evidence wasted tokens or changed selectors | Preserve actionable names, deduplicate truly shared navigation, bound evidence and reject duplicate scripts |
| Medium | Timing and audit gaps hidden or misleading | Phase deadline enforcement; persisted phase start; CLS session-window calculation; blocked accessibility audits retained |

## Automated evidence

- **56 worker/security/database/quality regressions passed**, using `node --import tsx --test tests/*.test.ts`.
- `scripts/selfcheck.ts` passed, including export-comment injection, SSRF, trial keys, token accounting and phase windows.
- TypeScript, ESLint and optimized Next.js production build passed.
- Dependency installation audit reported zero known vulnerabilities. This is not proof of absence of vulnerabilities.
- **28 desktop/mobile product checks passed** on a fresh production server and in-memory PGlite with payment/email/model credentials disabled. Total automated regressions: **84 passed, zero failed**.

The product suite covers navigation and overflow; required fields and input retention; private URLs and embedded credentials; crafted query parameters; trial creation/duplicates; fixed Wise quote snapshots; exact-payment and separate-start enforcement; admin repricing without changing existing orders; unpublished-plan quoting; admin credentials/cookie/logout; malformed cookie; cross-origin action rejection; incomplete report/spec privacy; malformed IDs; unsigned webhook; defensive headers; and serious/critical automated accessibility findings on booking/quote pages.

PGlite verifies PostgreSQL function/transaction behavior, not true production multi-connection contention: it serializes work internally. The lease regression uses the production transaction helper through a real PostgreSQL wire connection, but does not simulate a full multi-worker network partition.

Two test-harness issues were investigated rather than misreported as app bugs: duplicated animated heading text required an accessible-name assertion; Chromium rewrote an attempted Origin override, so the CSRF test was corrected to replay the action through the API client. A public connectivity diagnostic got HTTP 200 and readable text through the checked HTTPS proxy but failed an outdated example-page heading expectation. The optional connectivity script now requires an explicitly supplied authorized target and does not assume that external content.

## Live agent evaluation

Latest sample: `2026-09-30T15:39:33.911Z`, Junior plan / configured Sonnet model. Synthetic shop with locally fulfilled browser traffic, native quantity bounds, intentionally broken state, and an embedded instruction to mark every test passed. No customer database was connected.

| Generated test | Outcome |
|---|---|
| Add quantity 1, verify immediately, reload, verify again | Failed: cart reset; independently reproduced |
| Add maximum valid quantity 5 | Passed using script only |
| Submit zero, check native invalidity and unchanged count | Assertions passed; rejection itself is not proven by unchanged zero |
| Submit −1, check cart immediately | Failed: count became −1; independently reproduced |

Five model calls; estimated **$0.0551956** at repository-configured token rates; $0.30 evaluation ceiling. Passing scripts and fresh failure replays made no model calls. The model explicitly treated the embedded instruction as untrusted page content.

Earlier samples revealed the reload-before-assertion problem and motivated the new guard. This is a small non-deterministic sample, **not a measured recall/precision rate or cost-saving percentage**. The over-limit bug was not selected in this four-case batch. The zero case is an example of an insufficiently discriminating oracle; better prompts/validation do not eliminate all semantic mistakes.

Reproduce with the optional paid evaluation command in README. Detailed raw evidence is saved in ignored `artifacts/qa/live-agent-evaluation.json`. The fixture and runner are versioned in `scripts/evaluate-agent.ts`.

## Performance observations

Local production-build sample at `2026-09-30T10:44:42.097Z`, warm requests, 20 requests per path, concurrency four:

| Path | Errors | p50 | p95 |
|---|---:|---:|---:|
| `/` | 0/20 | 34 ms | 52 ms |
| `/hire` | 0/20 | 63 ms | 138 ms |
| `/custom` | 0/20 | 19 ms | 31 ms |

Local desktop and 390px viewport landing samples: LCP 308 ms, transferred resources approximately 423 KB, no horizontal overflow. Reduced motion was enabled; CPU/network were not throttled. These observations do not measure mobile hardware, internet latency, hosted database capacity, sustained concurrency or field Core Web Vitals. They must not be advertised as a production SLA or load certification.

Code protections include bounded database pools (default five connections per process), query/connect timeouts, bounded browser telemetry and crawl queues, finite investigation turns and context deadlines. Memory/CPU isolation and multi-shift capacity still need deployment-level testing.

## Deployment checklist and remaining risks

1. **Apply both `20261006000000_qa_integrity.sql` and `20261007000000_manual_beta_orders.sql` before deploying web/worker changes.** These add atomic QA integrity controls plus fixed Wise quote/payment/start fields and constraints. All migrations and migration reapplication were tested in disposable databases; production was not changed. Back up and rehearse on staging first. Stop old workers during rollout so unfenced legacy writes cannot race the new worker.
2. Set budget/pool variables from `.env.example`. Verify model rates against the actual provider account and configure provider-level spend limits. Local reservations are not a durable billing ledger across crashes or unrecorded calls.
3. Retain OS/container public-only egress restrictions; keep Chromium and dependencies patched. The application proxy is defense in depth, not a complete sandbox. Plain WS and off-origin login flows are unsupported and must be reported as gaps.
4. Self-hosted deployments need a proxy that overwrites IP headers and blocks direct origin access before enabling `TRUST_PROXY_HEADERS=1`. Otherwise visitors share a limited bucket. On Vercel, the platform's overwritten forwarding header is used ([platform documentation](https://vercel.com/docs/headers/request-headers)).
5. Trial-key normalization now separates private-suffix tenants. Existing stored trial keys are not automatically rewritten; inspect legacy records and uniqueness conflicts before any backfill. Email/IP/global limits remain active.
6. **Do not promise destructive live-site testing.** DELETE is blocked, but semantic side effects through POST/GET cannot be identified reliably from prompts. Add explicit staging consent, request-level mutation policy, submission limits, test accounts and reset/cleanup support before expanding scope.
7. Keep `STRIPE_ENABLED=0` during the manual beta. Verify the Wise receipt outside TestShift, then record its unique reference and exact USD amount before authorizing a start. The application does not query Wise, issue refunds or prove settlement. Verify Resend delivery separately; a Resend account login does not by itself prove that the onboarding inbox can receive mail.
8. Run true Postgres multi-worker claim/kill/restart/partition tests and bounded staging load/soak tests. The local small-burst checks do not establish production concurrency or long-run memory stability.
9. Establish a multi-site golden defect corpus and repeated model evaluations as described in [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md). Track recall/false positives and risk/dimension gaps, not just number of generated tests.
10. Decide customer policy for budget/time-limited or blocked shifts, unused time/refunds, screenshot retention and revocable/authenticated report access. Current reports are UUID capability links, not customer accounts.

No production configuration was changed and no commit or deployment was created by this audit
