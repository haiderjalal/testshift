import assert from "node:assert/strict";

import type { TestCase } from "@/lib/db";
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
      { action: "expect_text", value: "Buy milk" },
    ],
  } as TestCase;
  const spec = buildSpec("https://demo.playwright.dev/todomvc/", [failing, { ...failing, seq: 4, status: "pending" }]);
  assert.match(spec, /test\.describe\("mobile"/);
  assert.match(spec, /test\("#3 Adds a \\"todo\\""/);
  assert.match(spec, /\.fill\("Buy milk"\)/);
  assert.match(spec, /BUG \(major\): Nothing happens/);
  assert.doesNotMatch(spec, /#4/, "tests that never ran are not exported");

  console.log("selfcheck passed");
}

void main();
