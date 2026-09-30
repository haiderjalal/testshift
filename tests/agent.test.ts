import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

import { chromium, type Browser } from "playwright";

import type { Run, TestCase } from "../src/lib/db";
import { isPrivateIp } from "../src/lib/net";
import { buildSpec } from "../src/lib/spec";
import { perform } from "../worker/browser";

let browser: Browser;
let executeCase: typeof import("../worker/ai").executeCase;
let modelCalls = 0;
let modelInput: Record<string, unknown>[] = [];
let responseContent: (() => unknown[]) | null = null;
const model = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  modelInput.push(JSON.parse(Buffer.concat(chunks).toString()));
  modelCalls++;
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({
    id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-5-5",
    content: responseContent?.() ?? [{ type: "tool_use", id: `tool_${modelCalls}`, name: "finish", input: { status: "passed", actual: "Everything works", severity: "none" } }],
    stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
  }));
});
const run = { id: "00000000-0000-4000-8000-000000000001", url: "https://8.8.8.8/", plan: "junior", minutes: 20, is_trial: true, notes: "" } as Run;
const makeCase = (changes: Partial<TestCase> = {}): TestCase => ({
  id: "00000000-0000-4000-8000-000000000002", seq: 1, agent: "dev", feature: "F1", title: "Confirmation appears",
  category: "functional", priority: "high", viewport: "desktop", start_url: run.url,
  steps: ["Open page", "Check confirmation"], expected: "Confirmation appears", status: "pending",
  actual: null, severity: null, script: [], actions: [], has_screenshot: false, finished_at: null, ...changes,
});

before(async () => {
  await new Promise<void>((resolve) => model.listen(0, "127.0.0.1", resolve));
  const address = model.address();
  assert.ok(address && typeof address === "object");
  process.env.ANTHROPIC_API_KEY = "test-key-no-external-access";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${address.port}`;
  // This suite never loads .env.local and never opens a database connection.
  Object.assign(globalThis, { sql: () => Promise.resolve([]) });
  ({ executeCase } = await import("../worker/ai"));
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); model.closeAllConnections(); await new Promise<void>((resolve) => model.close(() => resolve())); });

/** All target responses are local fixtures; no request can leave this browser. */
function fixtureBrowser(html: string | (() => string) = "<h1>Confirmation</h1>", status = 200): Browser {
  return new Proxy(browser, {
    get(target, property) {
      if (property !== "newContext") return Reflect.get(target, property);
      return async (...args: Parameters<Browser["newContext"]>) => {
        const context = await browser.newContext(...args);
        const original = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await original();
          await page.route("**/*", (route) => route.fulfill({ status, contentType: "text/html", body: typeof html === "function" ? html() : html }));
          return page;
        };
        return context;
      };
    },
  });
}

test("SSRF guard rejects additional reserved and transition ranges", () => {
  for (const address of ["192.0.2.1", "198.51.100.1", "203.0.113.1", "2001:db8::1", "64:ff9b:1::a00:1", "100::1", "fec0::1"]) {
    assert.equal(isPrivateIp(address), true, address);
  }
});
test("suite never exports a passing test without an assertion", () => {
  const spec = buildSpec(run.url, [makeCase({ status: "passed", actions: [{ action: "goto", value: run.url }, { action: "click", selector: "button" }] })]);
  assert.doesNotMatch(spec, /test\("#1/);
});
test("blank URL assertions are rejected instead of always passing", async () => {
  const page = await browser.newPage();
  try { await assert.rejects(perform(page, { action: "expect_url", value: "" })); }
  finally { await page.close(); }
});
test("text checks distinguish a result from text that merely contains it", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent("<div>Not Confirmation</div>");
    await assert.rejects(perform(page, { action: "expect_text", value: "Confirmation" }));
    await assert.rejects(perform(page, { action: "expect_text", selector: "div", value: "Confirmation" }));
    await page.setContent("<div> Paid   $5.00 (USD) </div>");
    await perform(page, { action: "expect_text", selector: "div", value: "Paid $5.00 (USD)" });
  } finally { await page.close(); }
});
test("successful scripts use zero model calls", async () => {
  const before = modelCalls;
  const result = await executeCase({ browser: fixtureBrowser(), run, testCase: makeCase({ script: [{ action: "expect_text", value: "Confirmation" }] }), stopAt: Date.now() + 30_000 });
  assert.equal(result?.status, "passed");
  assert.equal(result?.scripted, true);
  assert.equal(modelCalls, before);
});
test("a model cannot pass a test without browser assertion evidence", async () => {
  const result = await executeCase({ browser: fixtureBrowser(), run, testCase: makeCase(), stopAt: Date.now() + 30_000 });
  assert.notEqual(result?.status, "passed");
});
test("HTTP authentication walls are blocked, never passed", async () => {
  const result = await executeCase({ browser: fixtureBrowser("<h1>Confirmation</h1>", 401), run,
    testCase: makeCase({ script: [{ action: "expect_text", value: "Confirmation" }] }), stopAt: Date.now() + 30_000 });
  assert.equal(result?.status, "blocked");
});
test("a 500 response cannot pass because an expected heading is present", async () => {
  const result = await executeCase({ browser: fixtureBrowser("<h1>Confirmation</h1>", 500), run,
    testCase: makeCase({ script: [{ action: "expect_text", value: "Confirmation" }] }), stopAt: Date.now() + 30_000 });
  assert.equal(result?.status, "failed");
});
test("an expired phase performs no browser or model work", async () => {
  const before = modelCalls;
  const result = await executeCase({ browser: fixtureBrowser(), run,
    testCase: makeCase({ script: [{ action: "expect_text", value: "Confirmation" }] }), stopAt: Date.now() - 1 });
  assert.equal(result, null);
  assert.equal(modelCalls, before);
});
test("failed assertions remain in replay evidence", async () => {
  modelInput = [];
  const result = await executeCase({ browser: fixtureBrowser(), run,
    testCase: makeCase({ script: [{ action: "expect_text", value: "Confirmation" }, { action: "expect_text", value: "Saved" }] }), stopAt: Date.now() + 30_000 });
  assert.notEqual(result?.status, "passed");
  assert.ok(modelInput.length > 0);
});

test("a confirmed failure is replayed from the original state, before investigation changed it", async () => {
  let turn = 0;
  responseContent = () => ++turn === 1 ? [{ type: "tool_use", id: "repair", name: "browser", input: { steps: [
    { action: "click", selector: "button" }, { action: "expect_text", value: "Cart items: 2" },
  ] } }] : [{ type: "tool_use", id: "finish", name: "finish", input: { status: "failed", actual: "Cart resets on reload", severity: "major" } }];
  try {
    const result = await executeCase({ browser: fixtureBrowser('<button onclick="document.querySelector(\'p\').textContent=\'Cart items: 2\'">Add two</button><p>Cart items: 0</p>'), run,
      testCase: makeCase({ script: [{ action: "click", selector: "button" }, { action: "expect_text", value: "Cart items: 2" }, { action: "reload" }, { action: "expect_text", value: "Cart items: 2" }] }), stopAt: Date.now() + 30_000 });
    assert.equal(result?.status, "failed");
    assert.match(result?.actual ?? "", /Reproduced in a fresh/);
    assert.equal(result?.actions.length, 5, "Investigation actions are not included in the original failure trace");
    assert.equal(result?.failedAssertion?.value, "Cart items: 2");
    assert.ok(result?.screenshot?.length);
  } finally { responseContent = null; }
});

test("a failure that passes an independent replay is inconclusive", async () => {
  let loads = 0;
  responseContent = () => [{ type: "tool_use", id: "finish", name: "finish", input: { status: "failed", actual: "Confirmation missing", severity: "major" } }];
  try {
    const result = await executeCase({ browser: fixtureBrowser(() => ++loads === 1 ? "<h1>Missing</h1>" : "<h1>Confirmation</h1>"), run,
      testCase: makeCase({ script: [{ action: "expect_text", value: "Confirmation" }] }), stopAt: Date.now() + 30_000 });
    assert.equal(result?.status, "blocked");
    assert.match(result?.actual ?? "", /independent replay/);
  } finally { responseContent = null; }
});

test("first-party runtime exceptions cannot hide behind a passing text assertion", async () => {
  const result = await executeCase({ browser: fixtureBrowser('<h1>Confirmation</h1><script>throw new Error("broken cart")</script>'), run,
    testCase: makeCase({ script: [{ action: "expect_text", value: "Confirmation" }] }), stopAt: Date.now() + 30_000 });
  assert.equal(result?.status, "failed"); assert.match(result?.actual ?? "", /broken cart/);
});

test("native validity, checked, enabled and count assertions inspect real browser state", async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<input id="email" type="email" required><input id="terms" type="checkbox" checked><button disabled>Pay</button><ul><li>A</li><li>B</li></ul>');
    await perform(page, { action: "expect_valid", selector: "#email", value: "false" });
    await perform(page, { action: "fill", selector: "#email", value: "qa@example.com" });
    await perform(page, { action: "expect_valid", selector: "#email", value: "true" });
    await perform(page, { action: "expect_checked", selector: "#terms", value: "true" });
    await perform(page, { action: "expect_enabled", selector: "button", value: "false" });
    await perform(page, { action: "expect_count", selector: "li", value: "2" });
    await assert.rejects(perform(page, { action: "expect_count", selector: "li", value: "1" }));
    await page.setContent('<p hidden>Duplicated</p><p>Duplicated</p>');
    await assert.rejects(perform(page, { action: "expect_hidden", selector: "p" }));
  } finally { await page.close(); }
});
