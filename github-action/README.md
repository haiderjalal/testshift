# TestShift repository QA action

This composite action runs a reviewed JSON list of commands on GitHub-hosted runners. It produces `.testshift/report.json` and a GitHub job summary, and returns a failing exit code for failed or blocked commands. It reports unconfigured categories and skips destructive checks unless explicitly enabled. It does not generate missing tests or provision arbitrary applications.

Download `/api/github/workflow` from your TestShift deployment to get the workflow, local action and configuration as one ZIP. Extract at your repository root, adapt `testshift.config.json`, review it and commit all files. The starter is for Node.js/Playwright with an ephemeral Postgres service; fixture migrations and the E2E app server are project-specific. Missing scripts fail rather than silently passing. Keep production secrets out of the workflow.

For another stack, supply command arrays and categories in your own version-1 config. Each check needs a unique name, a category (`setup`, `lint`, `types`, `unit`, `integration`, `build`, `e2e`, `destructive`), a command array and `timeoutSeconds` between 1 and 600. The root config must declare `disposable: true`. Setup failure blocks later checks. Commands execute without shell interpolation; configure an explicit interpreter when your reviewed suite needs one.

Destructive checks require all of: a GitHub-hosted runner, `TESTSHIFT_DISPOSABLE=1`, `disposable: true`, `destructiveApproved: true` and action input `destructive: "true"`. They should target only the ephemeral database and synthetic fixture accounts. This declaration cannot independently prove the resources are disposable: review the commands, fixtures and network targets. The runner's VM is reclaimed by GitHub, including on cancellation. Any external resources your commands create need a separate `if: always()` teardown and a TTL cleanup job.

Set branch protection to require the configured workflow, not just the optional TestShift reporting check: the latter is published after a completion webhook and is informational verification. CI can be disabled or altered by repository administrators, and a successful command is not full behavioral coverage.

The action is usable as a copied local action now. After publishing this repository, customers can also reference `OWNER/REPOSITORY/github-action@FULL_COMMIT_SHA`. No marketplace release or external repository reference is fabricated by the starter.
