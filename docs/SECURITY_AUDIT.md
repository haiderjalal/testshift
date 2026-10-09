# Production security audit — 2026-10-09

The local hardening pass is implemented and verified against an isolated production build. Production deployment settings and the live database have not been verified. Work is local and uncommitted; nothing was pushed, deployed, rotated, migrated in production, or published to a firewall.

## Scope and real attack surface

- Framework: Next.js 16.3.6 upgraded to 16.3.8; React 19.2.8. Read installed Next.js guidance for Server Actions, Proxy, CSP, headers and Route Handlers, including the upgraded Server Actions guide.
- Public pages: `/`, `/hire`, `/custom`, `/leaderboard`. Public data is limited to opted-in leaderboard summaries and published beta pricing.
- Public mutations: booking and custom quote Server Actions. They validate fields with Zod, including fixed plan/hour/consent choices; SQL values are bound parameters. Custom quotes already have a honeypot. Free trials already have durable visitor, mailbox, site and global caps.
- Owner pages: `/admin` and `/admin/login`. Login/logout and beta pricing, payment confirmation, quote and start actions exist. Mutating owner actions already check `isAdmin`; the dashboard loader now checks it too. The financial SQL uses a constant fragment, not user-supplied SQL.
- URL-shift reports: `/runs/[id]`, spec download and screenshots. The random UUID in the link remains a bearer capability. These legacy shifts are not bound to customer accounts. Screenshot queries bind both run ID and case ID; tests confirm another run cannot retrieve a known case. The later, explicitly requested GitHub integration adds separate GitHub customer sessions and ownership/current-access checks for repository reports; see [GitHub testing](GITHUB_TESTING.md).
- External delivery: one Stripe webhook, disabled during the manual Wise beta; Resend email delivery; Anthropic calls from the worker. Email templates are plain text and subject headers are flattened.
- Worker: bounded AI budget, lease-checked writes, browser-origin restrictions and a DNS-pinning forward proxy. Existing regression tests exercise private-network rejection before contact, HTTPS CONNECT refusal, reserved IP ranges and worker claim integrity.
- Database: Postgres/Supabase migrations enable RLS on application tables without public access policies. Functions use invoker privileges and an explicit search path. Actual production roles, grants, backups and applied migration state remain unverified.

## Findings and changes

| Finding | Change / outcome |
| --- | --- |
| Seven high-severity npm audit entries at baseline, including vulnerable Next.js and source-map-js | Next.js and its ESLint config upgraded to the smallest patched 16.3 release, 16.3.8. source-map-js updated to 1.2.2 through its existing dependency range. All direct dependencies pinned to exact installed versions; lockfile updated. No forced framework downgrade or overrides. |
| CSP did not restrict script, connection, image or other content sources | Added fresh cryptographic script nonces and a full source policy through Next Proxy. Rendering waits for each request so nonce-bearing HTML is not statically cached. Production forbids eval; styles permit inline attributes required by existing animations. Chromium tests verify hydration, fresh nonces, absence of unexpected violations and parser-injected script blocking. |
| Default 1 MB action limit; absent Origin could pass framework checks; webhook read was unbounded | Explicit 32 KiB action/parser and Proxy buffering limits, action-layer origin and FormData validation, canonical origin checks, media-type rejection, duplicate/file field rejection. Webhook reads at most 256 KiB with a five-second timeout, checks JSON media type and verifies the exact signed body. |
| Action rate-limit messages lacked HTTP-level abuse responses | Added durable Postgres-backed HTTP admission counters before form dispatch. Excess traffic receives 429, Retry-After, a request ID and no-store. Database failure rejects requests with a generic 503. Existing stricter action/trial limits remain in place. No in-memory global limiter is claimed. |
| Dashboard loader relied on its page caller for authorization | Loader now enforces owner authentication and validates period keys before querying. Existing anonymous owner-action replay test confirms knowledge of action/order IDs is insufficient. |
| Raw exception messages could contain customer data, provider payloads, SQL values or credentials | Structured logs accept a closed set of metadata fields; exception messages are replaced by error class names. Private report UUIDs are hashed for log correlation. Request security events carry request IDs. User-facing failed-run text is generic, including for older stored errors. |
| Webhook and report data-route failures lacked consistent safe responses | Added generic errors, safe events, request IDs and no-store responses; invalid or nonexistent IDs return 404. Screenshot caching changed from a one-year private cache to no-store. |
| Remote DB encryption/certificate verification was not enforced by code | Remote production connections explicitly require verified TLS, overriding insecure URL options. Loopback-only disposable/local DBs can use plaintext. Production connection verification did not succeed; owner must resolve credentials/network/CA settings before release. |
| Potential email header injection and insufficient delivery observability | Reject CR/LF/NUL in recipient/from/reply-to headers, retain flattened subjects, log safe delivery success/failure kinds. Resend already had a ten-second timeout; Stripe SDK requests now have a ten-second timeout and no automatic retries. |
| DNS lookups on public booking validation had no application timeout | Added a five-second fail-closed lookup timeout. Existing worker proxy continues pinning the checked IP to the actual connection. |
| Unnecessary browser privileges / cross-origin sharing | Added same-origin opener/resource policies. Verified existing HSTS, nosniff, DENY framing, referrer policy, permissions policy and disabled framework fingerprint header. Browser source maps explicitly disabled. No wildcard CORS added. |
| Insufficient repeatable security coverage | Added security unit tests, production Chromium desktop/mobile tests, a redacted secret scanner and a read-only DB security inspection script. Fixed ambiguous consent selectors in the existing tests. |

## Secrets and exposed files

No exposed secret values were found in 114 tracked files, 260 reachable Git-history blobs, public assets, root log files present at scan time, or 42 generated public asset files. The scanner checks recognizable provider/private-key/database credential patterns and exact configured local secret values. Browser tests separately scan generated client files without printing values. No local environment names were public-prefixed. These checks do not prove the absence of unknown credential formats or exposures in remote logs, old deployments, unreachable Git objects, or external storage.

Four secret settings exist in the ignored `.env.local`; values were not printed or modified. `.env.example` contains placeholders only and now documents exact production origin and verified DB TLS. No committed credential was found, so no rotation requirement was established by this audit. If owner inspection finds credentials in old production logs or deployments, those credentials must be rotated separately. Git history was not rewritten.

Only the intended SVG assets are in `public`. No generated files were found accidentally tracked. Live local HTTP checks return 404 for environment files, `.git/config`, package manifests, internal documentation, source/config files, build IDs, backup files, nonexistent admin/API paths, missing reports and browser source maps. Generated audit JSON reports are ignored.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed with Next.js 16.3.8; all application routes render dynamically for per-request nonces |
| `npm run test` | 63 tests passed: application, isolated database, worker/browser evidence, SSRF/egress, budget, lease and security regressions |
| `npm run check` | Passed: existing SSRF and exported-spec self-check |
| `npm run test:e2e -- --trace off` | 46/46 passed in desktop/mobile Chromium, using a disposable local database |
| `node --import tsx scripts/security-scan.ts --history` | Passed, no exposure findings; counts above |
| `npm audit --omit=dev` | Zero vulnerabilities |
| `npm audit` | Five high-severity development-only entries remain in the braces dependency chain |
| Read-only live database inspection | Failed safely; no customer rows retrieved and no database changes made |
| Final diff review / `git diff --check` | Reviewed for scope and whitespace; no pre-existing user edits were present at start |

Chromium coverage includes headers, unexpected CSP violations, injected scripts, same-origin/CORS rejection, absent Origin, invalid content types, malformed serialized actions and unsigned/malformed webhooks, oversized payloads, plan allowlists, stored and reflected markup, 429/Retry-After, forged cookies, anonymous admin mutations, private report screenshot isolation, sensitive-file exposure and client-bundle credential/source-map exposure. Unit tests also exercise streamed size limits and slow body timeout.

An intermediate browser run passed 40/40 tests. The expanded run initially encountered a full C: drive during Playwright artifact cleanup, after test assertions had succeeded. Only project-local generated `.next/cache` and `test-results` were removed. Final verification disables trace recording; the regular config still retains failure traces by default.

## Remaining risks and owner actions

1. **Production WAF:** connected Vercel projects could not be matched to this repository. Existing rules were not inspected. Review the concrete local proposal in `SECURITY_FIREWALL_DRAFT.md`, identify the actual project, create an unpublished provider draft, review its exact diff/traffic impact, and obtain explicit authorization before publishing. No remote draft or active rule was changed. [Vercel guidance](https://vercel.com/kb/guide/add-rate-limiting-vercel).
2. **Production DB:** rerun `node --env-file-if-exists=.env.local --import tsx scripts/security-db-inspect.ts` with working deployment access. Resolve verified TLS/CA issues, inspect RLS/public grants, remove inappropriate superuser/create-role privileges, separate migration-owner access from runtime roles, and verify backup retention and restore drills. Do not deploy this change until verified remote TLS succeeds. Any privilege/schema migration requires separate owner authorization.
3. **Owner credentials:** the existing owner password is a deployment/environment shared secret, not a customer password database. Comparison uses constant-time SHA-256 digests; scrypt at N=32768 stretches the session-signing key. This is not Argon2id/bcrypt password-hash storage. The plaintext environment secret and lack of MFA remain a limitation: keep it in the provider's restricted secret manager and choose a hashed credential or identity-provider upgrade separately. No owner password or credential rotation was introduced. GitHub customer sign-in uses GitHub's identity provider and is separate from this owner login.
4. **Private links:** possession of a report UUID authorizes report access. Links have no independent expiry/revocation or customer identity checks. Keep them out of analytics, external logs and shared URLs. Referrer, no-store, noindex and hashed application logs reduce leakage but do not convert the design into account-based authorization.
5. **Developer audit:** braces 3.0.3 has no patched published version. The affected chain is braces → micromatch → fast-glob → @next/eslint-plugin-next → eslint-config-next. npm's suggested Next 14 downgrade is incompatible with this Next 16 application. Do not feed attacker-controlled nested glob patterns to this tooling; track the upstream fix and rerun the full audit. [Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). All these remaining installed audit entries are marked development-only.
6. **Hosting and alerts:** set APP_URL to the exact public HTTPS origin, confirm the proxy overwrites IP headers and blocks direct origin access, and enable log alerts for repeated login failures, limiter/database outages, webhook errors and email failures. Add provider billing caps and worker egress/container isolation; these cannot be verified from application code. Inspect existing remote logs for earlier raw exception/report-link exposure. App request IDs and hashed run IDs support correlation; no external alert receiver was configured or messaged.
7. **Provider delivery:** no real Stripe payment, Resend delivery or paid Anthropic call was performed. Stripe remains disabled for beta. Signature verification is retained and unsigned events fail closed; valid live Stripe deliveries need owner/provider integration verification before enabling Stripe.
8. **CSP/performance:** per-request nonces require dynamic rendering and add an HTTP-level database lookup to accepted form POSTs. Inline styles are intentionally allowed for existing animations. No analytics/advertising scripts were present; any future integration needs explicit policy review and real-browser tests. Enforce request upload/time limits at the hosting layer as well; the framework owns form parsing and may emit its own generic parser diagnostics.
9. **Workstation:** C: had zero free space during verification. Generated cache cleanup recovered a small amount of space; broader disk cleanup remains the owner's responsibility.

## Files changed

- Configuration: `.env.example`, `.gitignore`, `next.config.ts`, `package.json`, `package-lock.json`.
- Request controls: `src/proxy.ts`, `src/lib/security.ts`, `src/lib/action-security.ts`, `src/app/layout.tsx`.
- Forms and owner authorization: `src/app/hire/actions.ts`, `src/app/custom/actions.ts`, `src/app/admin/actions.ts`, `src/app/admin/beta-actions.ts`, `src/app/admin/data.ts`.
- Routes and errors: `src/app/api/stripe/webhook/route.ts`, `src/app/runs/[id]/page.tsx`, `src/app/runs/[id]/spec/route.ts`, `src/app/runs/[id]/shots/[caseId]/route.ts`.
- Data/delivery/logging: `src/lib/db.ts`, `src/lib/email.ts`, `src/lib/log.ts`, `src/lib/net.ts`, `src/lib/payments.ts`.
- Tests: `tests/security.test.ts`, `tests/database.test.ts`, `tests/e2e/security.spec.ts`, `tests/e2e/product.spec.ts`, `tests/e2e/beta.spec.ts`, `tests/start-app.ts`.
- Operational review: `scripts/security-scan.ts`, `scripts/security-db-inspect.ts`, `docs/SECURITY_FIREWALL_DRAFT.md`, `docs/SECURITY_AUDIT.md`.

No commits, pushes, deployments, production migrations, secret changes, Git-history rewrites or firewall publications were performed.
