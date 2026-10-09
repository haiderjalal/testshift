import ts from "typescript";
import { z } from "zod";
import { containsSecret, GenerationError, type SourceSnapshot } from "./source";
import testToolsLock from "./test-tools-lock.json";

export const generatedSuiteSchema = z.object({
  summary: z.string().min(20).max(2000),
  gaps: z.array(z.string().min(1).max(500)).max(20),
  cases: z.array(z.object({ name: z.string().min(8).max(200), category: z.enum(["unit","integration","e2e"]), source: z.string().max(240), verifies: z.string().min(20).max(500) })).min(3).max(30),
  files: z.array(z.object({ path: z.string().max(240), content: z.string().min(30).max(20000) })).min(3).max(15),
});
export type GeneratedSuite = z.infer<typeof generatedSuiteSchema>;
export function validateGeneratedSuite(value: unknown, source: SourceSnapshot): GeneratedSuite {
  const suite = generatedSuiteSchema.parse(value);
  const paths = new Set<string>(); let bytes = 0;
  for (const file of suite.files) {
    if (!/^\.testshift\/generated\/(unit|integration|e2e)\/[a-z0-9-]{1,60}\.(?:test|spec)\.ts$/.test(file.path)
      || paths.has(file.path) || containsSecret(file.content)) throw new GenerationError("unsafe-generated-files");
    paths.add(file.path); bytes += Buffer.byteLength(file.content);
    if (file.path.includes('/e2e/') ? !file.path.endsWith('.spec.ts') : !file.path.endsWith('.test.ts')) throw new GenerationError("generated-filename-invalid");
    const result = ts.transpileModule(file.content, { fileName: file.path, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    if (result.diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error)) throw new GenerationError("generated-syntax-invalid");
    if (/\b(?:test|it|describe)\.(?:skip|todo|only)\s*\(|\b(?:eval|exec|spawn)\s*\(|child_process|process\.env\.(?:GITHUB|GH_|ANTHROPIC)|https?:\/\/(?!127\.0\.0\.1|localhost)/i.test(file.content)) throw new GenerationError("unsafe-generated-tests");
    if (!/\b(?:test|it)\s*\(/.test(file.content) || !/\bexpect\s*\(/.test(file.content)) throw new GenerationError("generated-assertions-missing");
    const syntax = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.ES2022, true);
    const constant = (node: ts.Expression): boolean => ts.isStringLiteral(node) || ts.isNumericLiteral(node)
      || [ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind)
      || ts.isParenthesizedExpression(node) && constant(node.expression)
      || ts.isBinaryExpression(node) && constant(node.left) && constant(node.right);
    const check = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'expect' && node.arguments[0] && constant(node.arguments[0])) throw new GenerationError("generated-placeholder-assertion");
      ts.forEachChild(node,check);
    };
    check(syntax);
  }
  if (bytes > 90000 || containsSecret(JSON.stringify(suite))) throw new GenerationError("unsafe-generated-files");
  for (const category of ["unit","integration","e2e"] as const) {
    if (!suite.files.some((file) => file.path.startsWith(`.testshift/generated/${category}/`)) || !suite.cases.some((item) => item.category === category)) throw new GenerationError("generated-coverage-missing");
  }
  if (suite.cases.some((item) => !source.files.some((file) => file.path === item.source))) throw new GenerationError("generated-source-unverified");
  return suite;
}

/** All executable CI setup is deterministic. The model can supply test files only. */
export function suiteFiles(suite: GeneratedSuite, source: SourceSnapshot) {
  const serve = source.stack === "next" ? "--hostname 127.0.0.1 --port 4173" : "--host 127.0.0.1 --port 4173";
  const files = [...suite.files,
    { path: ".testshift/generated/package.json", content: JSON.stringify({ private: true, type: "module", devDependencies: { vitest: "5.0.3", "@playwright/test": "1.64.0" } }, null, 2) + "\n" },
    { path: ".testshift/generated/package-lock.json", content: JSON.stringify(testToolsLock, null, 2) + "\n" },
    { path: ".testshift/generated/vitest.config.ts", content: `import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('${source.inventory.paths.some(path => path.startsWith('src/')) ? '../../src' : '../..'}', import.meta.url)) } }, test: {
  include: [process.env.TESTSHIFT_CATEGORY === 'integration' ? '.testshift/generated/integration/**/*.test.ts' : '.testshift/generated/unit/**/*.test.ts'],
  testTimeout: 15000, hookTimeout: 30000, reporters: ['default','junit'], outputFile: '.testshift/results.xml', passWithNoTests: false
} });\n` },
    { path: ".testshift/generated/playwright.config.ts", content: `import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e', timeout: 30000, retries: 0, workers: 1, forbidOnly: true,
  reporter: [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chromium', trace: 'retain-on-failure' },
  webServer: { command: '${source.manager} run dev ${source.manager === 'npm' ? '-- ' : ''}${serve}', url: 'http://127.0.0.1:4173', timeout: 120000, reuseExistingServer: false, cwd: '../..' }
});\n` },
    { path: ".testshift/generated/README.md", content: `# TestShift proposed test suite\n\n${suite.summary}\n\nSource commit: ${source.sha}\n\n${source.inventory.analyzedFiles} of ${source.inventory.totalFiles} files analyzed. ${source.inventory.exclusions}\n\n## Cases\n\n${suite.cases.map((item) => `- ${item.category}: ${item.name} — ${item.verifies} (source: ${item.source})`).join("\n")}\n\n## Coverage gaps / setup\n\n${suite.gaps.map((gap) => `- ${gap}`).join("\n") || "No additional prerequisites identified; review against your application before merging."}\n\nReview all AI-generated code. CI proves only the assertions that execute, not complete coverage. Local PostgreSQL is empty; tests must create and tear down synthetic fixtures. Production credentials, database URLs and external services are not supplied. No deployment steps are added. Root dependencies and existing workflows are preserved. The separate test toolchain has a reviewed lockfile and installs using npm ci.\n\nRun locally from the repository root using the commands in the proposed workflow, with disposable resources. Merge after reviewing the assertions and CI results. Future pushes rerun these tests; new source analysis is an explicit request, not automatic regeneration.\n` },
    { path: ".github/workflows/testshift-generated.yml", content: generatedWorkflow(source) },
  ];
  return files;
}
export function generatedWorkflow(source: SourceSnapshot) {
  return `name: TestShift generated tests
on:
  push:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: testshift-generated-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  tests:
    strategy:
      fail-fast: false
      matrix:
        category: [unit, integration, e2e]
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports: [5432:5432]
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      CI: "true"
      TESTSHIFT_DISPOSABLE: "1"
      TESTSHIFT_CATEGORY: \${{ matrix.category }}
      DATABASE_URL: postgres://postgres:postgres@127.0.0.1:5432/postgres
      NEXT_TELEMETRY_DISABLED: "1"
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803
        with:
          persist-credentials: false
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
        with:
          node-version: "24"
${source.manager === "pnpm" ? `      - name: Install pinned pnpm
        run: npm install --global pnpm@${source.pnpmVersion}
` : ""}      - name: Install repository dependencies
        run: ${source.manager === "pnpm" ? "pnpm install --frozen-lockfile" : "npm ci"}
      - name: Install generated test tools
        run: npm ci --prefix .testshift/generated --ignore-scripts --no-audit --no-fund
      - name: Generated unit and integration tests
        if: matrix.category != 'e2e'
        run: .testshift/generated/node_modules/.bin/vitest run --config .testshift/generated/vitest.config.ts
      - name: Install browser
        if: matrix.category == 'e2e'
        run: .testshift/generated/node_modules/.bin/playwright install --with-deps --no-shell chromium
      - name: Generated browser tests
        if: matrix.category == 'e2e'
        run: .testshift/generated/node_modules/.bin/playwright test --config .testshift/generated/playwright.config.ts
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
        if: always()
        with:
          name: testshift-\${{ matrix.category }}-evidence
          path: |
            .testshift/results.xml
            playwright-report
            test-results
          retention-days: 7
          if-no-files-found: ignore
`;
}
