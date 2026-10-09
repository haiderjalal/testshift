import assert from "node:assert/strict";
import { test } from "node:test";

import { judgeCompatibility, type EngineOutcome } from "../src/lib/compat";

const ok = (engine: EngineOutcome["engine"], ownIssues: string[] = []): EngineOutcome => ({ engine, status: 200, ownIssues, blocked: null });

test("the same result in every browser passes", () => {
  const verdict = judgeCompatibility({ url: "https://x.test/", outcomes: [ok("chromium"), ok("webkit")] });
  assert.equal(verdict.outcome, "passed");
});

test("errors every browser shows are a site bug, not a browser difference", () => {
  const verdict = judgeCompatibility({
    url: "https://x.test/",
    outcomes: [ok("chromium", ["uncaught exception: boom"]), ok("webkit", ["uncaught exception: x is undefined"])],
  });
  assert.equal(verdict.outcome, "passed");
});

test("errors in only one browser are a minor browser-specific failure, with evidence", () => {
  const verdict = judgeCompatibility({
    url: "https://x.test/",
    outcomes: [ok("chromium"), ok("webkit", ["uncaught exception: ResizeObserver loop"])],
  });
  assert.equal(verdict.outcome, "failed");
  assert.equal(verdict.severity, "minor");
  assert.match(verdict.detail, /WebKit reported errors/);
  assert.match(verdict.detail, /ResizeObserver loop/);
});

test("a page one browser cannot load is a major failure, and names the browser", () => {
  const verdict = judgeCompatibility({
    url: "https://x.test/",
    outcomes: [ok("chromium"), { engine: "webkit", status: 500, ownIssues: [], blocked: null }],
  });
  assert.equal(verdict.outcome, "failed");
  assert.equal(verdict.severity, "major");
  assert.match(verdict.detail, /WebKit returned HTTP 500/);
});

test("a page no browser loads is not a browser difference", () => {
  const verdict = judgeCompatibility({
    url: "https://x.test/",
    outcomes: [
      { engine: "chromium", status: 503, ownIssues: [], blocked: null },
      { engine: "webkit", status: 503, ownIssues: [], blocked: null },
    ],
  });
  assert.equal(verdict.outcome, "not-comparable");
});

test("fewer than two comparable browsers means nothing is compared", () => {
  const verdict = judgeCompatibility({
    url: "https://x.test/",
    outcomes: [ok("chromium"), { engine: "webkit", status: 0, ownIssues: [], blocked: "The browser network policy refused this destination." }],
  });
  assert.equal(verdict.outcome, "not-comparable");
});
