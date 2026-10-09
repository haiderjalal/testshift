import assert from "node:assert/strict";
import { test } from "node:test";

import type { BrowserAction } from "../src/lib/db";
import { isRiskyStep } from "../worker/explore";

const step = (action: BrowserAction["action"], selector?: string, value?: string): BrowserAction => ({ action, selector, value });

test("the explorer may navigate, observe and type, but not use controls that change real data", () => {
  assert.equal(isRiskyStep(step("goto", undefined, "https://site.example/products")), false);
  assert.equal(isRiskyStep(step("click", "link 'Products'")), false);
  assert.equal(isRiskyStep(step("fill", "textbox 'Quantity'", "-1")), false);
  assert.equal(isRiskyStep(step("expect_visible", "heading 'Products'")), false);
});

test("buttons that place orders, pay, delete or send are refused", () => {
  for (const name of ["Place order", "Pay now", "Delete account", "Send message", "Cancel subscription", "Submit"]) {
    assert.equal(isRiskyStep(step("click", `button '${name}'`)), true, name);
  }
});

test("keys that submit a form are refused; navigation keys are allowed", () => {
  assert.equal(isRiskyStep(step("press", undefined, "Enter")), true);
  assert.equal(isRiskyStep(step("press", undefined, "Tab")), false);
  assert.equal(isRiskyStep(step("press", undefined, "Escape")), false);
});

test("typing text that mentions an action word is refused too, to stay on the safe side", () => {
  assert.equal(isRiskyStep(step("fill", "textbox 'Message'", "please send this")), true);
});

test("an exploratory suspect is accepted only with a final assertion, and duplicates are dropped", async () => {
  const { validateDrafts } = await import("../worker/ai");
  const run = { url: "https://shop.example/", plan: "lead", minutes: 60 } as never;
  const suspect = (script: BrowserAction[]) => ({
    feature: "",
    title: "Cart total updates after quantity change",
    category: "exploratory" as const,
    priority: "high" as const,
    viewport: "desktop" as const,
    start_url: "https://shop.example/cart",
    steps: ["Change the quantity to 2", "Read the total"],
    expected: "Total doubles",
    script: script.map((s) => ({ action: s.action, selector: s.selector ?? "", value: s.value ?? "" })),
  });
  const asserted = [
    step("goto", undefined, "https://shop.example/cart"),
    step("fill", "spinbutton 'Quantity'", "2"),
    step("expect_text", "text 'Total'", "$20.00"),
  ];
  const accepted = validateDrafts([suspect(asserted)], run, null, []);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].category, "exploratory");

  const noAssertion = validateDrafts([suspect([step("goto", undefined, "https://shop.example/cart"), step("fill", "spinbutton 'Quantity'", "2")])], run, null, []);
  assert.equal(noAssertion.length, 0, "a script without a final assertion proves nothing");

  const twice = validateDrafts([suspect(asserted), suspect(asserted)], run, null, []);
  assert.equal(twice.length, 1, "the same scenario is not reported twice");
});
