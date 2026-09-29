import assert from "node:assert/strict";

import { agentWindows } from "@/lib/agents";
import type { TestCase } from "@/lib/db";
import { tokenCost } from "@/lib/plans";
import { isPublicHost } from "@/lib/net";
import { buildSpec } from "@/lib/spec";

/** Smallest checks for the two paths that must not silently break: the SSRF guard and the spec export. */
async function main(): Promise<void> {
  for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.10", "169.254.169.254", "[::1]", "::ffff:127.0.0.1", "fd00::1"]) {
    assert.equal(await isPublicHost(host), false, `${host} must be blocked`);
  }
  for (const host of ["8.8.8.8", "demo.playwright.dev"]) {
    assert.equal(await isPublicHost(host), true, `${host} must be allowed`);
  }

  const failing = {
    seq: 3,
    agent: "uat",
    title: 'Adds a "todo"',
    viewport: "mobile",
    expected: "Item appears",
    status: "failed",
    actual: "Nothing happens",
    severity: "major",
    actions: [
      { action: "goto", value: "https://demo.playwright.dev/todomvc/" },
      { action: "fill", selector: 'role=textbox[name="What needs to be done?"]', value: "Buy milk" },
      { action: "press", selector: 'role=textbox[name="What needs to be done?"]', value: "Enter" },
      { action: "dblclick", selector: "text=Buy milk" },
      { action: "reload" },
      { action: "back" },
      { action: "expect_text", value: "Buy milk" },
    ],
  } as TestCase;
  const spec = buildSpec("https://demo.playwright.dev/todomvc/", [failing, { ...failing, seq: 4, status: "pending" }]);
  assert.match(spec, /test\.describe\("End-to-end tests · UAT agent"/, "tests are grouped by agent");
  assert.match(spec, /test\.describe\("mobile"/);
  assert.doesNotMatch(spec, /Unit tests/, "agents with no executed tests are left out");

  // Token cost: 1M input + 1M output on Opus 5.5 is $4 + $20.
  assert.equal(tokenCost("claude-opus-5-5", { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 }), 24);
  // Agent windows cover the whole shift, in order, without gaps.
  const windows = agentWindows(0, 1000);
  assert.deepEqual(windows.map((w) => w.agent.id), ["dev", "staging", "uat", "prod"]);
  assert.equal(windows[0].from, 0);
  assert.ok(Math.abs(windows[3].to - 1000) < 1e-9);
  windows.slice(1).forEach((w, i) => assert.equal(w.from, windows[i].to));
  assert.match(spec, /test\("#3 Adds a \\"todo\\""/);
  assert.match(spec, /\.fill\("Buy milk"\)/);
  assert.match(spec, /\.dblclick\(\);/);
  assert.match(spec, /page\.reload\(\);/);
  assert.match(spec, /page\.goBack\(\);/);
  assert.match(spec, /BUG \(major\): Nothing happens/);
  assert.doesNotMatch(spec, /#4/, "tests that never ran are not exported");

  console.log("selfcheck passed");
}

void main();
