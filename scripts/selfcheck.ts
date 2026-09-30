import assert from "node:assert/strict";

import { agentWindows } from "@/lib/agents";
import type { TestCase } from "@/lib/db";
import { tokenCost } from "@/lib/plans";
import { emailKey, isPrivateIp, isPublicHost, siteKey } from "@/lib/net";
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
  // 1-hour cache writes are billed at 2× input ($8/M on Opus 5.5), 5-minute writes at 1.25× ($5/M).
  assert.equal(tokenCost("claude-opus-5-5", { input: 0, output: 0, cacheRead: 0, cacheWrite: 1_000_000, cacheWrite1h: 1_000_000 }), 13);
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

  // Code injection: a line separator in the booked URL or in model-written text must not escape a comment.
  const LS = String.fromCharCode(0x2028);
  const hostile = buildSpec(`https://site.test/${LS}require("child_process")//`, [
    { ...failing, actual: `broken${LS}globalThis.PWNED = 1`, expected: `ok${LS}process.exit(1)` },
  ]);
  for (const line of hostile.split(new RegExp(`[${String.fromCharCode(13, 10, 0x2028, 0x2029)}]`))) {
    if (/require\(|PWNED|process\.exit/.test(line)) assert.ok(line.trim().startsWith("//"), `payload escaped a comment: ${line}`);
  }

  // Trial keys: one per mailbox and per registrable domain.
  assert.equal(emailKey("A.B+promo@GMAIL.com"), "ab@gmail.com");
  assert.equal(emailKey("qa+1@example.com"), "qa@example.com");
  assert.equal(siteKey("shop.example.com"), "example.com");
  assert.equal(siteKey("www.example.co.uk."), "example.co.uk");
  for (const ip of ["169.254.169.254", "64:ff9b::7f00:1", "2002:7f00:1::", "198.18.0.1", "::127.0.0.1", "fe80::1"]) {
    assert.equal(isPrivateIp(ip), true, `${ip} must be private`);
  }
  assert.equal(isPrivateIp("8.8.8.8"), false);

  console.log("selfcheck passed");
}

void main();
