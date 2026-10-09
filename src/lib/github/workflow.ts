/** Starter uses a copied local action; it does not reference an unpublished marketplace package. */
export const customerWorkflow = `name: TestShift QA
on:
  push:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: testshift-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  testshift:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      CI: "true"
      TESTSHIFT_DISPOSABLE: "1"
      DATABASE_URL: postgres://postgres:postgres@127.0.0.1:5432/postgres
      NEXT_TELEMETRY_DISABLED: "1"
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
        with:
          persist-credentials: false
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
        with:
          node-version: "24"
          cache: npm
      - name: TestShift reviewed suite
        uses: ./.github/actions/testshift
        with:
          config: testshift.config.json
          destructive: "false"
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        if: always()
        with:
          name: testshift-report
          path: .testshift/report.json
          retention-days: 7
          if-no-files-found: error
`;
export const customerConfig = {
  version: 1, disposable: true, destructiveApproved: false,
  checks: [
    { name: "Install dependencies", category: "setup", command: ["npm", "ci"], timeoutSeconds: 300 },
    { name: "Install test browser", category: "setup", command: ["npm", "exec", "--no", "--", "playwright", "install", "--with-deps", "chromium"], timeoutSeconds: 300 },
    { name: "Lint", category: "lint", command: ["npm", "run", "lint"], timeoutSeconds: 120 },
    { name: "Types", category: "types", command: ["npm", "run", "typecheck"], timeoutSeconds: 120 },
    { name: "Unit tests", category: "unit", command: ["npm", "test"], timeoutSeconds: 300 },
    { name: "Integration tests", category: "integration", command: ["npm", "run", "test:integration"], timeoutSeconds: 300 },
    { name: "Build", category: "build", command: ["npm", "run", "build"], timeoutSeconds: 300 },
    { name: "End-to-end tests", category: "e2e", command: ["npm", "run", "test:e2e"], timeoutSeconds: 600 },
  ],
};
