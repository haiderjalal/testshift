import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run, SitePage, Strategy, TestCase } from "../src/lib/db";
import { AGENTS } from "../src/lib/agents";
import { assessResults, scopedUrl, urlMatches, validateAction } from "../src/lib/qa";
import { verifyAdminToken } from "../src/lib/admin";
import { siteKey } from "../src/lib/net";
import { visitorKey } from "../src/lib/rateLimit";
import { buildSpec } from "../src/lib/spec";
import { validateDrafts, fallbackReport } from "../worker/ai";
import { AiBudget, BudgetExceededError, DeadlineError, budgetLimit, endBudget, startBudget, withinBudget } from "../worker/budget";
import { compactOutline, formatSiteMap, normalizeLink } from "../worker/browser";

const url = "https://site.example/";
const run = { id: "quality", plan: "junior", url, minutes: 20, is_trial: true } as Run;
const strategy: Strategy = { summary: "Test forms", features: [{ id: "F1", name: "Forms", url, risk: "high", what_to_test: "Input validation" }] };
const draft = { feature: "F1", title: "Empty input", category: "negative" as const, priority: "high" as const, viewport: "desktop" as const,
  start_url: url, steps: ["Clear input", "Check input"], expected: "Input is empty", script: [{ action: "fill" as const, selector: "#name", value: "" }, { action: "expect_value" as const, selector: "#name", value: "" }] };
const completed = AGENTS.map((agent, i) => ({ ...draft, agent: agent.id, id: `id${i}`, seq: i, status: "passed", actions: draft.script, actual: "Empty", severity: null, has_screenshot: false, finished_at: null }) as TestCase);

test("no tests is incomplete, with no score and no invented strengths", () => {
  const result = assessResults([], strategy);
  assert.equal(result.verdict.label, "Incomplete"); assert.equal(result.score, null);
  assert.deepEqual(fallbackReport([], strategy).strengths, []);
});
test("blocked and running cases do not count as feature coverage", () => {
  for (const status of ["blocked", "running", "pending"] as const) {
    const result = assessResults(completed.map((c) => ({ ...c, status })), strategy);
    assert.equal(result.coverage[0].covered, false); assert.equal(result.verdict.label, "Incomplete");
  }
});
test("a fully evaluated inventory can produce Go; critical bugs always produce No-go", () => {
  assert.equal(assessResults(completed, strategy).verdict.label, "Go");
  assert.equal(assessResults([{ ...completed[0], status: "failed", severity: "critical" }], strategy).verdict.label, "No-go");
  assert.equal(assessResults(completed.map((c) => ({ ...c, status: "failed", severity: "major" })), strategy).verdict.label, "Go with caution");
});
test("missing feature inventory cannot certify a release", () => assert.equal(assessResults(completed, null).verdict.label, "Incomplete"));
test("planner retains empty-string boundary values", () => {
  assert.deepEqual(validateDrafts([draft], run, strategy, [])[0].script, draft.script);
});
test("duplicate scripts across agents and differently named drafts are discarded", () => {
  assert.equal(validateDrafts([draft, { ...draft, title: "Same behavior renamed" }], run, strategy, []).length, 1);
  assert.equal(validateDrafts([{ ...draft, title: "Repeat" }], run, strategy, completed).length, 0);
});
test("a hostile navigation invalidates the whole script rather than being dropped", () => {
  const bad = { ...draft, script: [{ action: "goto" as const, value: "https://attacker.example/", selector: "" }, ...draft.script] };
  assert.equal(validateDrafts([bad], run, strategy, []).length, 0);
});
test("unknown/malformed steps and assertion-free scripts are rejected", () => {
  assert.throws(() => validateAction({ action: "fill" }));
  assert.throws(() => validateAction({ action: "expect_text", value: "" }));
  assert.throws(() => validateAction({ action: "expect_hidden" }));
  assert.equal(validateDrafts([{ ...draft, script: draft.script.slice(0, 1) }], run, strategy, []).length, 0);
});

test("planner rejects reloads that erase an unchecked state change", () => {
  assert.equal(validateDrafts([{ ...draft, script: [draft.script[0], { action: "reload", selector: "", value: "" }, draft.script[1]] }], run, strategy, []).length, 0);
});
test("planner does not downgrade off-origin URLs into a test on the home page", () => {
  assert.equal(validateDrafts([{ ...draft, start_url: "https://elsewhere.example/" }], run, strategy, []).length, 0);
});
test("navigation scope isolates different tenants, schemes and ports", () => {
  for (const target of ["https://other.github.io/", "http://tenant.github.io/", "https://tenant.github.io:444/", "https://u:p@tenant.github.io/", "javascript:alert(1)"]) {
    assert.equal(scopedUrl(target, "https://tenant.github.io"), null);
  }
  assert.equal(scopedUrl("/pricing", "https://tenant.github.io"), "https://tenant.github.io/pricing");
});
test("outline compaction preserves long actionable names", () => {
  const name = "Long exact accessible button name ".repeat(5);
  assert.ok(compactOutline(`- button "${name}"`).includes(name));
});
test("shared navigation only describes elements present on every page", () => {
  const pages = [0, 1, 2].map((i) => ({ url: `${url}${i}`, title: "", status: 200, loadMs: 100, issues: [], outline: i < 2 ? '- button "Submit"' : '- heading "No form"' }) as SitePage);
  assert.doesNotMatch(formatSiteMap(pages), /On every page/);
});
test("crawler preserves SPA routes and removes tracking-only query parameters", () => {
  assert.equal(normalizeLink(`${url}?utm_source=ad#/cart`, "https://site.example"), `${url}#/cart`);
  assert.equal(normalizeLink(`${url}#heading`, "https://site.example"), url);
});
test("export includes the observed failing check, but excludes runtime-only failures", () => {
  const failing = { ...completed[0], status: "failed" as const, actions: [{ action: "goto" as const, value: url }, ...draft.script], failure_assertion: draft.script[1] };
  assert.match(buildSpec(url, [failing]), /toHaveValue\(""\)/);
  assert.doesNotMatch(buildSpec(url, [{ ...failing, failure_assertion: null }]), /test\("#/);
});
test("budget refuses a request before spending and cannot be refunded twice", () => {
  const budget = new AiBudget(0.1);
  assert.throws(() => budget.reserve("claude-fable-5-1", "test", 20_000), BudgetExceededError);
  const settle = budget.reserve("claude-sonnet-5-5", "test", 100);
  settle(0.02); settle(0); assert.equal(budget.spent, 0.02);
});
test("resumed cost counts against the budget", () => {
  assert.throws(() => new AiBudget(0.1, 0.1).reserve("claude-sonnet-5-5", "test", 1), BudgetExceededError);
});
test("expired or exhausted requests never call the model transport", async () => {
  let calls = 0;
  const transport = async () => { calls++; return { model: "claude-sonnet-5-5", usage: { input_tokens: 1, output_tokens: 1 } }; };
  await assert.rejects(withinBudget(run, "", 1, Date.now() - 1, transport), DeadlineError);
  startBudget(run.id, new AiBudget(0));
  await assert.rejects(withinBudget(run, "", 1, Date.now() + 1_000, transport), BudgetExceededError);
  assert.equal(calls, 0); endBudget(run.id);
});
test("default trial and paid budgets bound exposure", () => {
  assert.equal(budgetLimit("principal", 20, true), 2);
  assert.equal(budgetLimit("junior", 60, false), 7.5);
});
test("URL checks cannot pass by matching a substring of the wrong destination", () => {
  assert.equal(urlMatches("https://site.example/not-success", "/success"), false);
  assert.equal(urlMatches("https://site.example/success", "/"), false);
  assert.equal(urlMatches("https://site.example/success", "/success"), true);
  assert.equal(urlMatches("https://site.example/#/cart", "#/cart"), true);
});
test("malformed Unicode admin cookies fail closed without throwing", () => {
  for (const token of ["bad", `${Date.now() + 1000}.${"é".repeat(64)}`, `${Date.now() + 1000}.${"f".repeat(64)}.extra`, `Infinity.${"f".repeat(64)}`]) {
    assert.equal(verifyAdminToken(token, "test-only-password-12345"), false);
  }
});

test("trial site keys separate hosted tenants using the public suffix list", () => {
  assert.equal(siteKey("shop.Example.co.uk."), "example.co.uk");
  assert.equal(siteKey("a.github.io"), "a.github.io");
  assert.equal(siteKey("b.github.io"), "b.github.io");
  assert.equal(siteKey("shop.a.github.io"), "a.github.io");
  assert.equal(siteKey("8.8.8.8"), "8.8.8.8");
});

test("untrusted proxy headers cannot rotate visitor rate-limit keys", () => {
  const a = new Headers({ "x-forwarded-for": "8.8.8.8" });
  const b = new Headers({ "x-forwarded-for": "1.1.1.1" });
  assert.equal(visitorKey(a, false), visitorKey(b, false));
  assert.notEqual(visitorKey(a, true), visitorKey(b, true));
  assert.equal(visitorKey(new Headers({ "x-forwarded-for": "malformed" }), true), visitorKey(a, false));
  assert.equal(visitorKey(new Headers({ "x-forwarded-for": "2001:4860:4860:0:0:0:0:8888" }), true),
    visitorKey(new Headers({ "x-forwarded-for": "2001:4860:4860::8888" }), true));
});
