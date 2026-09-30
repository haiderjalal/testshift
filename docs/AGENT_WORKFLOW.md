# TestShift agent workflow and quality contract

Audit revision: 2026-09-30. This document describes implemented behavior unless explicitly marked as a next step. The goal is useful, reproducible defects per dollar—not maximum test counts or a promise to find every bug.

## 1. Scope and safety before execution

The customer supplies a public URL, plan, duration, focus notes and permission confirmation. Server validation rejects credentials in URLs and private/reserved destinations. Atomic database functions enforce booking/trial limits; hosted tenants have separate public-suffix-list trial keys.

All four named agents are phases of one browser-testing worker. They do not connect to four deployment environments: they test the booked origin. No credentials, authenticated roles, real payment, CAPTCHA bypass or mailbox integration is supported. Source-level unit testing is not possible from a URL alone.

The worker obtains a claim token. Writes to test cases and run state lock the run row and verify that the claim is still current. Losing a heartbeat claim closes the browser. Phase timing is persisted so a restart cannot silently grant a fresh full testing window.

The Chromium browser uses a local forward proxy which validates DNS and connects to the same vetted public IP. HTTP requests and HTTPS tunnels to private/reserved addresses are refused before contact. Browser routing adds origin restrictions and blocks DELETE, downloads and service workers. Plaintext WebSocket upgrades are currently blocked; WSS uses guarded tunnels. Keep an infrastructure egress firewall and isolated worker containers.

Page text, test results and customer notes are untrusted data, not system instructions. Fixed rules prohibit destructive operations, real orders and messaging real people. These semantic restrictions are partly prompt-based: an application can mutate state through POST or even GET. Consequently, **destructive/load testing is only appropriate on explicitly authorized disposable staging fixtures**. The present product must not advertise arbitrary destructive testing of live client sites.

## 2. Discover the site once

The bounded crawler records URLs, HTTP status, timing, console/network issues and a compact accessibility outline. It retains exact actionable names and collects native field constraints such as required, type, min/max, length and pattern. SPA hash routes survive URL normalization; tracking query parameters are removed.

Navigation shared by every discovered page is represented once. Text, queue size, events and outlines are bounded to control memory and prompt cost. This is a sampled inventory, not proof that every route or state was discovered. Failed or inaccessible pages are not replaced with stale page content.

## 3. Build a risk-ranked feature inventory

One strategy call groups observed capabilities into stable feature IDs (F1, F2, …), with URL, risk and test focus. Features should be product capabilities, not one feature per individual test. Hidden behavior is not invented.

Risk order: data loss and core journeys; forms/search/cart and state; navigation and error recovery; accessibility/layout and cosmetic checks. Customer requirements outrank guessed conventions, but cannot relax safety rules.

For each high-risk feature, planning is instructed to consider:

| Dimension | Example | Useful observable evidence |
|---|---|---|
| Happy path | Valid quantity adds items | Correct count/status, not just a successful click |
| Equivalence classes | Valid vs malformed email | Native validity and application outcome |
| Boundaries | Empty, min−1, min, max, max+1 | Exact value, count or visible result |
| State transitions | Add → check → reload → check | Immediate outcome and persisted outcome separately |
| Recovery | Invalid input → correction → resubmit | Error clears and intended result occurs |
| Interaction | Keyboard, disabled/checked state | Focus/action and concrete state assertion |
| Layout | Desktop; mobile where enabled | Supported viewport and actionable elements |
| Environment failures | 401, 429, 500, unavailable prerequisite | Blocked vs actual application failure |

This matrix currently guides the model; the database does **not** yet enforce completion of every dimension. Feature coverage means “at least one completed check,” not exhaustive behavior coverage.

## 4. Generate small executable batches

Each case has a feature, title, category, priority, viewport, start URL, human-readable steps, expected result and a browser script. The planner sees completed coverage, unresolved areas, recent failures and existing titles. It prioritizes high-risk gaps within the remaining phase time.

Validation rejects malformed steps, off-origin navigation, overly long cases and duplicate title/expectation or script combinations across phases. Empty strings are preserved as valid boundary inputs. Non-empty scripts must end with an assertion.

An important guard rejects explicit reload/back/goto after unchecked state changes. A negative quantity test must check the cart **before** reload; otherwise reload could erase the bad count and falsely pass. Semantic oracle quality still requires evaluation: any assertion is not automatically the correct assertion.

Supported checks: visible, hidden, exact text, exact URL/path/query/hash, input value, native validity, enabled state, checked state and element count. Scoped text checks also use exact, whitespace-tolerant matching. Ambiguous locators are not silently reduced to the first match.

## 5. Execute scripts before calling the model

Each case starts in fresh storage with the plan's viewport. Passing scripts require no execution-model call. Console/network issues are bounded and separated from third-party noise; a passing text assertion does not hide observed first-party runtime errors.

HTTP 401/403/429 and browser/policy/infrastructure obstacles are blocked. HTTP application errors cannot pass because a heading happens to match. Case/phase deadlines stop browser work and bound API requests.

If execution fails or there is no usable script, a bounded investigator can inspect the current page and batch up to eight browser steps per turn. It may repair locators but must not weaken the acceptance criterion. A model `finish(passed)` is rejected without a final browser assertion, or while an assertion/runtime error remains unresolved. Unsupported verdicts eventually become blocked, not invented passes.

## 6. Reproduce assertion failures independently

The original action prefix and failed assertion are retained before the investigator changes the page. A reported assertion failure is replayed from fresh storage with no extra model call.

- Same final assertion fails after prerequisites succeed: confirmed assertion failure; preserve trace and screenshot.
- Final assertion passes: inconclusive/intermittent, represented as blocked.
- Earlier prerequisite fails, access changes or time runs out: blocked; do not claim independent confirmation.

HTTP/runtime-only findings remain observations; they do not automatically have an exportable replay assertion. Reproduction confirms the browser observation, not the model's business interpretation or root-cause explanation.

## 7. Report honestly

Status separates passed, failed, blocked and unreached checks. Only passed/failed count toward completed feature checks. Missing feature inventory, untouched features, unfinished checks or a phase with no completed tests make the verdict Incomplete. Critical defects produce No-go even with incomplete coverage.

The displayed score is deterministic: priority-weighted passing checks divided by evaluated checks. No evaluated checks means no score. It is not a security certification or defect probability. Go explicitly applies only to completed checks.

Narrative generation receives failure/blocked cases first, with bounded context and explicit truncation notice. If the model is unavailable, time expires or the budget is exhausted, a deterministic report preserves results without another paid call. The complete case list remains separate from the shortened narrative.

The downloaded Playwright suite includes only completed cases with replayable assertions. Failed cases need the recorded failed assertion. Accessibility, timing, HTTP-only and runtime-only observations stay in the report; the export must not suggest that merely opening their pages reproduces those findings.

## 8. Cost controls

- One feature strategy reused across phases; cached site/strategy prefix.
- Compact evidence, bounded logs and recent investigation history.
- Script-first execution; deterministic audits and failure replay cost zero model tokens.
- Cross-phase duplicate suppression and finite planning retries.
- Lower output ceilings by task and low-effort investigation/report writing.
- No automatic SDK retries or server-side model fallback chains.
- Before each model request, reserve a conservative input/output cost estimate. Stop new calls if remaining allowance is insufficient.
- Defaults: $2 estimated AI cost per trial; 25% of paid revenue. Configure with `QA_MAX_TRIAL_USD` and `QA_AI_REVENUE_FRACTION`.
- Account for recorded spend on resume. Failed API calls retain their local reservation. Use a deterministic final report when necessary.

Budgeting uses configured model rates, not provider invoices. Unknown failed-call charges, usage-log failures and process crashes are not durably reserved across restarts. Configure provider-level spending limits; a durable request-cost ledger is a production follow-up. A budget-limited shift must report gaps, not fabricate extra checks to fill purchased time.

## 9. Evaluation and launch gates

Implemented regressions use real Chromium with locally fulfilled pages, a mock model endpoint, private-network sentinel, and disposable PGlite database. `scripts/evaluate-agent.ts` optionally exercises the real planner/investigator on a synthetic shop containing known defects and prompt-injection text. It cannot touch the customer database or actual target sites.

The latest live sample detected cart state loss and negative quantity acceptance and reproduced both. It also exposes a remaining oracle limitation: adding zero leaves an empty count unchanged whether or not the handler rejects zero. A green check for that observable state is **not proof of business-level rejection**. The over-limit bug was not selected in this four-case batch. Never turn this sample into a claim of perfect recall.

Before broad commercial release, build a versioned golden corpus with healthy and mutated forms, carts, search, pagination, auth walls, SPA navigation, network failures, duplicate controls, native/custom validation and hostile page instructions. Include non-mutating and authorized staging-only cases separately. Label expected outcomes independently of the agent.

Track confirmed-defect recall, false-positive rate, blocked rate, coverage by risk/dimension, flaky reproduction rate, time to first meaningful defect, script-only execution ratio, model calls, cost per confirmed defect and cost per shift. Repeat across seeds, models and plan levels; compare identical fixtures and budgets. No blanket cost-saving percentage is established by a single sample.

Additional launch work: scoped credential roles; request-level mutation allowlists and submission limits; durable budget reservations; true multi-worker Postgres contention/kill/restart tests; hosted load/soak tests with explicit limits; Stripe and Resend sandbox verification; retention/revocation of report links; customer policy for unused time/refunds. These are not silently claimed as implemented.
