# GitHub App and repository QA

The integration is implemented locally. It needs an owner-registered GitHub App, the reviewed migration, configured server secrets and a running reporting worker before real customers can connect. No App has been registered, credentials changed, production migration applied or workflow published by this change.

## Customer flow

1. Open `/repositories` and sign in with GitHub. OAuth uses a browser-bound, one-time state and PKCE. Short-lived user tokens are encrypted server-side and the browser receives only an opaque session cookie. Sessions last at most one hour; customers sign in again rather than retaining refresh tokens.
2. Install the App on selected repositories. The installation return is state-bound and verified through GitHub's user-accessible installation API. A query parameter alone never establishes access.
3. Choose the installation, repository URL and workflow path. TestShift requires current repository administrator permission and verifies the intersection of the user's and App installation's repository access. Each customer can connect up to 20 repositories.
4. Download the starter ZIP. Extract it at the repository root, adapt the reviewed commands and fixtures in `testshift.config.json`, and commit all included files. The default workflow path is `.github/workflows/testshift.yml`.
5. Push a commit or open a pull request. GitHub-hosted Actions runs the configured suite with read-only checkout permissions, no persisted checkout credential and no TestShift App keys. A fresh Postgres service is provided by the Node.js starter. Missing scripts fail; they are not treated as passing tests.
6. GitHub sends a signed `workflow_run` completion event. The webhook verifies the exact raw payload, enforces body/time bounds and atomically deduplicates the delivery and queues the matching repository/commit/attempt.
7. The separate reporting worker verifies the workflow run and jobs against GitHub's REST API, checks the owner's current administrator permission, publishes a `TestShift QA` check, and stores a private report. Individual assertion counts are not inferred from command/job success. Full runner evidence remains in GitHub Actions.
8. Customers view their reports on `/repositories` and `/repositories/jobs/[id]`. Both ownership and current GitHub authority are checked before private data is displayed. Disconnecting removes TestShift connections and reports; remove the workflow separately to stop GitHub CI.

The existing public-URL AI browser worker remains independent. This integration executes reviewed repository commands. It does not yet generate new source tests with AI, clone private repositories onto the website host or provision arbitrary application stacks. Installing an App alone cannot create missing tests or guarantee full coverage.

## Register and activate the GitHub App

Confirmed owner: [haiderjalal](https://github.com/haiderjalal). Confirmed production origin: `https://testshift.musme.co`. The exact public registration settings are saved in [GITHUB_APP_REGISTRATION.json](GITHUB_APP_REGISTRATION.json). Register while signed in as this owner at [GitHub App registration](https://github.com/settings/apps/new). The name is proposed; use the actual globally unique slug GitHub assigns.

Set production `APP_URL=https://testshift.musme.co`. The callback is `https://testshift.musme.co/api/github/callback`, setup URL is `https://testshift.musme.co/api/github/setup`, and webhook URL is `https://testshift.musme.co/api/github/webhook`. Local development can keep its existing loopback APP_URL; it has not been overwritten.

| Setting | Value |
| --- | --- |
| Homepage | Your TestShift HTTPS origin |
| User authorization callback | `APP_URL/api/github/callback` |
| Setup URL | `APP_URL/api/github/setup` |
| Webhook URL | `APP_URL/api/github/webhook` |
| Webhook content type | JSON |
| Repository permissions | Metadata read, Contents read, Actions read, Checks write |
| Events | Workflow run, Installation, Installation repositories, GitHub App authorization |
| Request OAuth authorization during installation | Leave unchecked; TestShift explicitly initiates sign-in with PKCE |
| User token expiration | Enabled |
| Installation selection | Selected repositories recommended |

Installation lifecycle and authorization events are provided according to GitHub's App event rules. Do not request Contents write, Actions write, Administration write or Workflows write for this implementation. It reads existing runs and publishes checks; workflow installation is reviewed and committed by the repository administrator.

Set the server-only variables documented in `.env.example`: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` and `GITHUB_TOKEN_ENCRYPTION_KEY`. Use an independently generated webhook secret of at least 32 characters and a separate canonical base64 encoding of 32 random bytes for the token encryption key. The PEM key supports literal newline escapes. Keep these in the deployment secret store; the website never requests customers' passwords or personal tokens.

Review `supabase/migrations/20261009000000_github.sql`, apply it to the intended database with the existing migration process, deploy the web app and run `npm run github:worker` as a separately supervised long-running process. The web server only accepts events; the reporting worker processes jobs. A normal request-limited Vercel Function is not the long-running worker host. The SQL uses RLS without browser access policies; use the server database role.

Configure GitHub delivery retries/redelivery monitoring and worker health monitoring. Set branch protection to require the actual test workflow; the optional TestShift reporting check appears after completion and is not a pre-execution gate. Test authorization, a push, a PR, reruns, revocation and uninstall against a disposable pilot repository before inviting customers.

## Action and destructive profiles

The downloadable ZIP contains the workflow, `.github/actions/testshift/action.yml`, its dependency-free runner, a reviewed-config starter and setup notes. It uses a local action so it works without a fabricated marketplace release. The source action is in `github-action/`; after publication it may also be referenced by its actual repository path pinned to a full commit SHA.

The starter expects Node.js, npm, Playwright and scripts for lint, types, units, integration, build and E2E. Supply fixture migrations and an E2E app-server lifecycle in your own setup/test scripts. Adapt the commands and services for Python or other stacks. The runner records each command as passed, failed, blocked or skipped, with timing, and lists unconfigured categories in `.testshift/report.json`. It bounds each command and the outer workflow bounds total time. Setup failure blocks dependent checks.

Destructive checks require `disposable: true`, `destructiveApproved: true`, action input `destructive: "true"` and `TESTSHIFT_DISPOSABLE=1` on a GitHub-hosted runner. A declared profile cannot prove arbitrary commands target safe resources: review the configured commands, fixtures and network destinations. Deletion, rollback, malformed-state and recovery checks must use the fresh database and synthetic accounts. Production credentials and real customer data do not belong in the workflow. External resources need an `if: always()` teardown plus TTL cleanup; GitHub reclaims its hosted VM on cancellation, but cannot clean cloud resources created by your scripts.

The action refuses persistent self-hosted execution. Do not use `pull_request_target` to execute untrusted PR code with secrets or write credentials. App credentials stay in the trusted reporting worker, never the test runner. The starter uses read-only checkout permissions, pinned official actions and a seven-day report artifact retention. Broader UI traces can contain sensitive data: add them only with an agreed retention and access policy.

Fork PRs can run the secret-free Actions suite subject to GitHub approval rules. TestShift's broker conservatively blocks cross-repository head commits and unsupported workflow events; it does not infer coverage or publish an App check for them. Preview resources and organization SSO need customer-specific setup.

## Persistence and recovery

Private tables store GitHub identities, encrypted one-hour sessions, ten-minute OAuth/install states, connections, delivery IDs and report jobs. A unique connection/run/attempt key prevents duplicate jobs. Workers claim rows with exclusive expiring leases, retry temporary failures up to five times with backoff, and recover checks created before a crash using this App's ID and the job's external ID. Source access removal, suspension, uninstall and OAuth revocation deactivate connections and block pending jobs. Reconnection requires fresh access verification.

The worker revalidates lease/connection state before publishing and predicates final writes on the lease. GitHub publication and the database are separate systems, so exactly-once external effects cannot be guaranteed across every crash; recovery deduplicates ordinary retries. Removal racing an already in-flight API request may leave a check in GitHub; revocation prevents subsequent processing and private report access.

The worker deletes report jobs and webhook delivery IDs after 30 days, and expired sessions/states during regular cleanup. Delivery deduplication is bounded to that retention window. Customer disconnect cascades report deletion immediately. GitHub retains Actions evidence independently under the customer's policy. Changing the encryption key invalidates stored user tokens and requires sign-in again; App keys and webhook secrets must follow an owner-managed rotation procedure.

## Verification and deployment limits

Local tests cover signature tampering, encryption/account binding, App JWTs, PKCE/state replay/expiry, selected-repository administration checks, immutable workflow identities, deduplication, lease recovery, revocation, broker check publication and token revocation. Browser regressions use a disposable PGlite database and a fixture-only mocked GitHub transport; no live GitHub customer credentials or production integrations are used. The downloadable ZIP and YAML are validated separately. Hosted Actions and live App installation still require a configured deployment and a pilot run.

Final local validation: production build, lint, TypeScript and self-check passed; 82 application/database/security tests plus 6 action-runner tests passed; all 60 desktop/mobile browser regressions passed. Production dependency audit found zero vulnerabilities and the source/generated-asset secret scan found no exposure. Windows' independent ZIP reader opened the generated starter archive, all workflow/action YAML parsed successfully, and Next.js deployment tracing includes both downloadable action source files. These results verify local behavior, not a live GitHub deployment.

References: [GitHub user access tokens and PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [Installation access and repository permissions](https://docs.github.com/en/rest/apps/installations), [Workflow run API](https://docs.github.com/en/rest/actions/workflow-runs), [Actions security](https://docs.github.com/en/actions/reference/security/secure-use).
