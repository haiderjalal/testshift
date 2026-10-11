import assert from "node:assert/strict";
import { test } from "node:test";

import type { Browser } from "playwright";

import { browserProblem } from "../worker/engines";

test("a browser that cannot start is reported as an install step, not as the driver's message", async () => {
  const problem = await browserProblem(() => Promise.reject(new Error("browserType.launch: Executable doesn't exist at C:\\x")));
  assert.match(problem ?? "", /playwright install/);
  assert.doesNotMatch(problem ?? "", /Executable doesn't exist/);
});

test("a browser that starts is reported as no problem, and is closed again", async () => {
  let closed = false;
  const browser = { close: async () => { closed = true; } } as unknown as Browser;
  assert.equal(await browserProblem(async () => browser), null);
  assert.equal(closed, true);
});
