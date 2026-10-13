import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";

// The rest of the e2e suite runs with reduced motion (see playwright.config.ts), which switches the motion system
// off. These tests turn it on, and also check that switching it off leaves a plain, complete page.

const TOUR_STOPS = ["agent-dev", "agent-staging", "agent-uat", "agent-prod"];

/** Scrolls the way a visitor does: wheel events, which the smooth-scroll layer eases. */
async function wheel(page: Page, deltaY: number): Promise<void> {
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(1400);
}

async function serious(page: Page): Promise<{ id: string; targets: unknown[] }[]> {
  await page.evaluate(axe.source);
  return page.evaluate(async () =>
    (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations
      .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
      .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  );
}

test.describe("scroll story, motion on", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the motion system starts and the page finds all of its chapters", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\bjs\b/);
    await expect(page.locator("html")).toHaveClass(/\bready\b/);
    await expect(page.locator("html")).toHaveClass(/\blenis\b/);
    await expect(page.locator("html")).not.toHaveClass(/\brm\b/);
    await expect(page.locator("html")).toHaveAttribute("data-active-chapter", "hero");
    const chapters = await page.locator("section[data-chapter]").evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset.chapter));
    expect(chapters).toEqual(["hero", "statement", "agents", "coverage", "live", "deliverables", "pricing", "faq", "cta"]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Four AI agents. One QA shift.");
    expect(errors).toEqual([]);
  });

  test("a header link scrolls to its section, marks itself current and keeps the page", async ({ page, isMobile }) => {
    test.skip(isMobile, "The header links live behind the menu on phones.");
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\bready\b/);
    await page.evaluate(() => {
      (window as unknown as { __kept: boolean }).__kept = true;
    });
    await page.getByRole("link", { name: "Pricing", exact: true }).first().click();
    await expect(page).toHaveURL(/#pricing$/);
    await expect(page.locator("html")).toHaveAttribute("data-active-chapter", "pricing", { timeout: 8000 });
    await expect(page.locator("header").getByRole("link", { name: "Pricing" })).toHaveAttribute("aria-current", "location");
    expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept), "same document, not a reload").toBe(true);
  });

  test("on large screens the agent tour is pinned: scrolling steps through the agents and a tab scrolls to its stop", async ({ page, isMobile }) => {
    test.skip(isMobile, "The tour is only pinned on large screens.");
    test.setTimeout(90_000); // Fourteen wheel steps, each given time to ease, in a software-rendered browser.
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\bready\b/);
    await page.getByRole("link", { name: "Agents", exact: true }).first().click();
    await expect(page.locator("html")).toHaveAttribute("data-active-chapter", "agents", { timeout: 8000 });

    const stage = page.locator("section[data-chapter=agents] [data-pin-stage]");
    expect(await stage.evaluate((node) => getComputedStyle(node).position)).toBe("sticky");

    const seen: string[] = [];
    for (let step = 0; step < 14; step++) {
      const selected = await page.locator("[role=tab][aria-selected=true]").getAttribute("id");
      if (selected && seen.at(-1) !== selected) seen.push(selected);
      await wheel(page, 380);
    }
    expect(seen, "scrolling through the tour visits the agents in order").toEqual(TOUR_STOPS);

    await page.getByRole("tab", { name: /UAT agent/ }).click();
    await page.waitForTimeout(2500);
    await expect(page.getByRole("tab", { name: /UAT agent/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("html")).toHaveAttribute("data-active-chapter", "agents");
  });

  test("the header slides away while reading down and returns on the first scroll up", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\bready\b/);
    await wheel(page, 900);
    await wheel(page, 500);
    await expect(page.locator("html")).toHaveAttribute("data-nav", "hidden");
    const hidden = await page.locator("header.site-header").evaluate((node) => node.getBoundingClientRect().bottom);
    expect(hidden, "the capsule has left the screen").toBeLessThan(0);
    await wheel(page, -300);
    await expect(page.locator("html")).toHaveAttribute("data-nav", "shown");
    const shown = await page.locator("header.site-header").evaluate((node) => node.getBoundingClientRect().bottom);
    expect(shown).toBeGreaterThan(0);
  });

  test("the landing page has no serious accessibility violations, including the dimmed statement words", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\bready\b/);
    // Bring the statement on screen at its start, when most of its words are still dimmed: the worst case for contrast.
    await page.evaluate(() => document.querySelector("section[data-chapter=statement]")?.scrollIntoView());
    await page.waitForTimeout(1500);
    expect(await serious(page), "statement, dimmed").toEqual([]);

    // Walk the page so every reveal has played, then let transitions finish (axe reads mid-fade opacity as low contrast).
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 700) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(3500);
    expect(await serious(page), "whole page, revealed").toEqual([]);
  });
});

test.describe("scroll story, reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing is hidden, nothing is pinned and nothing is smoothed", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\brm\b/);
    await expect(page.locator("html")).not.toHaveClass(/\blenis\b/);
    const stages = await page.locator("[data-pin-stage]").evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).position));
    expect(stages).toEqual(["static", "static"]);
    const hiddenBelowTheFold = await page.evaluate(() => {
      const hidden: string[] = [];
      document.querySelectorAll("[data-reveal], [data-split] .split-unit").forEach((node) => {
        if (Number(getComputedStyle(node).opacity) < 0.99) hidden.push(node.className);
      });
      return hidden;
    });
    expect(hiddenBelowTheFold).toEqual([]);
    // The statement reads in full, with no dimmed words.
    const dimmed = await page.locator(".scrub-word").evaluateAll((nodes) => nodes.filter((n) => Number(getComputedStyle(n).opacity) < 0.99).length);
    expect(dimmed).toBe(0);
  });
});
