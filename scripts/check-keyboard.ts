import assert from "node:assert/strict";
import { chromium } from "playwright";

import { keyboardFocusProblems } from "../worker/browser";

/**
 * Fixture check for the keyboard focus rule. Each page is loaded with setContent, so no network is involved.
 *
 *   npm run check:keyboard
 */
const CASES: { name: string; html: string; expectProblem: boolean }[] = [
  {
    name: "focus outline removed, no replacement",
    html: `<style>button:focus { outline: none; }</style><button>Buy</button><button>Next</button>`,
    expectProblem: true,
  },
  {
    name: "browser default focus ring",
    html: `<button>Buy</button><a href="#x">Read more</a>`,
    expectProblem: false,
  },
  {
    name: "custom focus shadow",
    html: `<style>button:focus-visible { outline: none; box-shadow: 0 0 0 3px #1d4ed8; }</style><button>Buy</button>`,
    expectProblem: false,
  },
];

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const c of CASES) {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><html><body>${c.html}</body></html>`);
      const problems = await keyboardFocusProblems(page);
      await page.close();
      const found = problems.length > 0;
      assert.equal(found, c.expectProblem, `${c.name}: expected ${c.expectProblem ? "a problem" : "no problem"}, got ${JSON.stringify(problems)}`);
      console.log(`${c.name}: ${found ? `flagged (${problems[0].help})` : "not flagged"}`);
    }
    console.log("Keyboard focus fixtures passed.");
  } finally {
    await browser.close();
  }
}

void main();
