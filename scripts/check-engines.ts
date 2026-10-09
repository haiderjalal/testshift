import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { launchEngine } from "../worker/engines";
import { startEgressProxy } from "../worker/egress";
import type { EngineId } from "../src/lib/compat";
import { errorMessage } from "../src/lib/log";

/**
 * Leak check for every browser engine the worker can run. A local server on loopback plays the part of an
 * internal service. The engine loads it through the checked proxy, and the server must receive zero requests.
 * Run this on the machine that runs the worker before enabling an engine in QA_ENGINES.
 *
 *   npm run check:engines
 */
const ENGINES: EngineId[] = ["chromium", "webkit", "firefox"];

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
  });
}

async function main(): Promise<void> {
  let internalHits = 0;
  const internal = createServer((_req, res) => {
    internalHits++;
    res.end("internal service");
  });
  const port = await listen(internal);
  const proxy = await startEgressProxy();
  const failures: string[] = [];

  try {
    for (const engine of ENGINES) {
      let browser;
      try {
        browser = await launchEngine(engine, proxy.server);
      } catch (e) {
        console.log(`${engine}: could not start on this machine (${errorMessage(e).split("\n")[0]}). Not enabled.`);
        continue;
      }
      try {
        // A bare context, not openContext(): this tests the engine's proxy handling, not the app's route guard.
        const context = await browser.newContext();
        const page = await context.newPage();
        internalHits = 0;
        for (const target of [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`]) {
          await page.goto(target, { timeout: 15_000 }).catch(() => undefined);
        }
        await context.close();
        if (internalHits > 0) {
          failures.push(engine);
          console.log(`${engine}: LEAK. The internal server received ${internalHits} request(s) that bypassed the proxy.`);
        } else {
          console.log(`${engine}: loopback requests refused by the checked proxy.`);
        }
      } finally {
        await browser.close().catch(() => undefined);
      }
    }
  } finally {
    await proxy.close();
    await new Promise<void>((resolve) => internal.close(() => resolve()));
  }

  if (failures.length > 0) {
    console.log(`Do not enable: ${failures.join(", ")}.`);
    process.exitCode = 1;
  }
}

void main();
