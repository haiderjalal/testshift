import assert from "node:assert/strict";
import { test } from "node:test";

import type { SitePage } from "../src/lib/db";
import { acceptScenarioCases, type ScenarioCaseDraft } from "../src/lib/documents/scenarios";
import { buildModel, numberCases, orderCases, selectCases, summarize, type DocumentCase } from "../src/lib/documents/model";
import { buttonsOf, featureOf, fieldsOf, headingsOf, linksOf, observationsOf, ruleCases, scanCases } from "../src/lib/documents/rules";

const origin = new URL("https://shop.example.com/");

const PRICING_OUTLINE = [
  '- heading "Pricing plans" [level=1]',
  "- paragraph: Choose a plan",
  '- link "Home":',
  "  - /url: /",
  '- link "Contact":',
  "  - /url: /contact",
  '- button "Start trial"',
  'Observed field constraints: [{"label":"Work email","id":"email","type":"email","required":""},{"label":"Seats","id":"seats","type":"number","min":"1","max":"10"},{"label":"Company name","id":"company","maxlength":"40","minlength":"2","pattern":"[A-Za-z ]+"},{"label":"Promo","id":"promo","disabled":""}]',
].join("\n");

const page = (url: string, outline: string, overrides: Partial<SitePage> = {}): SitePage => ({
  url,
  title: "Pricing",
  status: 200,
  loadMs: 800,
  outline,
  issues: [],
  ...overrides,
});

const titles = (cases: DocumentCase[]): string[] => cases.map((c) => c.title);

test("the crawl's own text is read: headings with levels, links with targets, buttons and field constraints", () => {
  assert.deepEqual(headingsOf(PRICING_OUTLINE), [{ text: "Pricing plans", level: 1 }]);
  assert.deepEqual(linksOf(PRICING_OUTLINE), [
    { name: "Home", href: "/" },
    { name: "Contact", href: "/contact" },
  ]);
  assert.deepEqual(buttonsOf(PRICING_OUTLINE), ["Start trial"]);
  assert.equal(fieldsOf(PRICING_OUTLINE).length, 4);
  assert.deepEqual(fieldsOf("no constraints here"), []);
  assert.deepEqual(fieldsOf("Observed field constraints: not json"), [], "a malformed constraint line is ignored, not guessed at");
});

test("a loaded page gets the checks its structure allows, and form fields get boundary and negative cases", () => {
  const cases = ruleCases([page("https://shop.example.com/pricing", PRICING_OUTLINE)], origin);
  const all = titles(cases);
  assert.ok(all.includes("Open /pricing and confirm it loads"));
  assert.ok(all.includes("Confirm the browser tab title of /pricing"));
  assert.ok(all.includes("Confirm the main heading of /pricing"));
  assert.ok(all.includes("Confirm /pricing finishes loading within 3 seconds"));
  assert.ok(all.includes("Check /pricing on a phone-sized screen"));
  assert.ok(all.includes("Use /pricing with the keyboard only"));
  assert.ok(all.includes('Submit /pricing with "Work email" empty'));
  assert.ok(all.includes('Enter an invalid email address in "Work email"'));
  assert.ok(all.includes('Enter 0 in "Seats", just below the minimum'));
  assert.ok(all.includes('Enter 1 in "Seats", the minimum'));
  assert.ok(all.includes('Enter 10 in "Seats", the maximum'));
  assert.ok(all.includes('Enter 11 in "Seats", just above the maximum'));
  assert.ok(all.includes('Type more than 40 characters into "Company name"'));
  assert.ok(all.includes('Submit "Company name" with fewer than 2 characters'));
  assert.ok(all.includes('Enter a value in the wrong format in "Company name"'));
  assert.ok(all.includes('Follow the link "Contact" on /pricing'));
  assert.ok(all.includes('Select the "Start trial" button on /pricing'));
  assert.equal(all.some((t) => t.includes("Promo")), false, "a disabled field is never tested");
});

test("link and field expectations come from the page: a link's target and a field's stated limit", () => {
  const cases = ruleCases([page("https://shop.example.com/pricing", PRICING_OUTLINE)], origin);
  const contact = cases.find((c) => c.title === 'Follow the link "Contact" on /pricing');
  assert.equal(contact?.expected, "The browser goes to https://shop.example.com/contact, and that page loads without an error.");
  const tooLong = cases.find((c) => c.title === 'Type more than 40 characters into "Company name"');
  assert.equal(tooLong?.expected, "The field keeps at most 40 characters.");
  assert.equal(tooLong?.source, "crawl");
});

test("a page that did not load gets only its load check, with what the scan saw", () => {
  const cases = ruleCases([page("https://shop.example.com/old", PRICING_OUTLINE, { status: 404, title: "" })], origin);
  const pageCases = cases.filter((c) => c.pageUrl === "https://shop.example.com/old");
  assert.deepEqual(titles(pageCases), ["Open /old and confirm it loads"]);
  assert.match(pageCases[0].observed, /HTTP 404/);
});

test("a page that needs a login says so, instead of being reported as broken", () => {
  const cases = ruleCases([page("https://shop.example.com/account", "", { status: 401 })], origin);
  const load = cases.find((c) => c.title === "Open /account and confirm it loads");
  assert.match(load?.observed ?? "", /login/);
});

test("a missing main heading is reported only when the outline is complete", () => {
  const complete = ruleCases([page("https://shop.example.com/a", '- paragraph: text\n- heading "Sub" [level=2]')], origin);
  assert.ok(titles(complete).includes("Check that /a has exactly one H1 heading"));
  const cut = ruleCases([page("https://shop.example.com/a", '- paragraph: text\n- heading "Sub" [level=2]\n…(truncated)')], origin);
  assert.equal(titles(cut).includes("Check that /a has exactly one H1 heading"), false, "a cut-off outline could hide the real H1");
});

test("a missing title is a medium priority finding; a present title is a low priority regression check", () => {
  const untitled = ruleCases([page("https://shop.example.com/a", "", { title: "" })], origin).find((c) => c.title === "Confirm the browser tab title of /a");
  assert.equal(untitled?.priority, "medium");
  assert.equal(untitled?.expected, "The page has a non-empty title.");
  const titled = ruleCases([page("https://shop.example.com/a", "", { title: "About us" })], origin).find((c) => c.title === "Confirm the browser tab title of /a");
  assert.equal(titled?.priority, "low");
  assert.equal(titled?.expected, 'The tab title reads "About us".');
});

test("links and buttons are listed once across the site, and the missing-page check appears once", () => {
  const cases = ruleCases(
    [page("https://shop.example.com/", PRICING_OUTLINE), page("https://shop.example.com/pricing", PRICING_OUTLINE)],
    origin,
  );
  assert.equal(cases.filter((c) => c.title === 'Follow the link "Contact" on /').length, 1);
  assert.equal(cases.filter((c) => c.title === 'Follow the link "Contact" on /pricing').length, 0, "the second page does not repeat a link already listed");
  assert.equal(cases.filter((c) => c.title === "Open a page that does not exist").length, 1);
});

test("accessibility scan findings become one case per rule, and blocked pages are skipped", () => {
  const cases = scanCases(
    [
      {
        url: "https://shop.example.com/pricing",
        violations: [
          { id: "image-alt", impact: "critical", help: "Images must have alternate text", count: 2 },
          { id: "color-contrast", impact: "moderate", help: "Text needs enough contrast", count: 1 },
          { id: "landmark", impact: null, help: "Landmarks should be used", count: 3 },
        ],
      },
      { url: "https://shop.example.com/account", blocked: "HTTP 401", violations: [] },
    ],
    [page("https://shop.example.com/pricing", PRICING_OUTLINE)],
  );
  assert.equal(cases.length, 3);
  assert.deepEqual(cases.map((c) => c.priority), ["high", "medium", "low"]);
  assert.ok(cases.every((c) => c.source === "scan" && c.type === "accessibility"));
  assert.equal(cases[0].title, "Accessibility: Images must have alternate text on /pricing");
  assert.equal(cases[0].observed, "The scan found 2 element(s) breaking this rule (impact: critical).");
});

test("observations list the site's own problems, never third-party noise", () => {
  const lines = observationsOf([
    page("https://shop.example.com/a", "", { issues: ["HTTP 500 https://shop.example.com/api", "[third-party] console error: analytics"] }),
  ]);
  assert.deepEqual(lines, ["/a: HTTP 500 https://shop.example.com/api"]);
});

test("features and titles stay short, however long the address is", () => {
  const long = `https://shop.example.com/${"segment/".repeat(60)}`;
  const feature = featureOf({ url: long, title: "A title" });
  assert.ok(feature.length <= 200, `feature is ${feature.length} characters`);
  const cases = ruleCases([page(long, "", { title: "" })], origin);
  assert.ok(cases.every((c) => c.title.length <= 300));
});

test("selection keeps the most important cases when the limit is reached, in their original order", () => {
  const make = (title: string, priority: DocumentCase["priority"], pageUrl = "https://shop.example.com/"): DocumentCase => ({
    feature: "Home", title, type: "functional", priority, source: "crawl", pageUrl, preconditions: "", testData: "",
    steps: ["Step one.", "Step two."], expected: "Expected result.", observed: "",
  });
  const cases = [make("low one", "low"), make("high one", "high"), make("medium one", "medium"), make("high one", "high"), make("high two", "high")];
  const kept = selectCases(cases, 3);
  assert.deepEqual(kept.map((c) => c.title), ["high one", "medium one", "high two"], "the repeated title is removed, then the low case goes first");
});

test("cases are grouped by feature in the order features first appear, then by priority, and numbered in reading order", () => {
  const base = { type: "functional" as const, source: "crawl" as const, pageUrl: "https://shop.example.com/", preconditions: "", testData: "", steps: ["A.", "B."], expected: "Yes.", observed: "" };
  const ordered = orderCases([
    { ...base, feature: "Checkout", title: "pay", priority: "high" },
    { ...base, feature: "Home", title: "look", priority: "low" },
    { ...base, feature: "Checkout", title: "coupon", priority: "low" },
    { ...base, feature: "Checkout", title: "card", priority: "medium" },
  ]);
  assert.deepEqual(ordered.map((c) => c.title), ["pay", "card", "coupon", "look"]);
  assert.deepEqual(numberCases(ordered).map((c) => c.code), ["TC-001", "TC-002", "TC-003", "TC-004"]);
  assert.equal(summarize(ordered).features, 2);
  assert.equal(summarize(ordered).byPriority.high, 1);
});

test("a built model carries the host, the summary and the notes it was given", () => {
  const model = buildModel({
    siteUrl: "https://shop.example.com/",
    generatedAt: new Date("2026-10-11T12:00:00Z"),
    pages: [{ url: "https://shop.example.com/", title: "Home", status: 200 }],
    cases: [{ feature: "Home", title: "Open home", type: "smoke", priority: "high", source: "crawl", pageUrl: "https://shop.example.com/", preconditions: "", testData: "", steps: ["Open it.", "Wait."], expected: "Loads.", observed: "" }],
    observations: [],
    notes: ["Scope note."],
  });
  assert.equal(model.host, "shop.example.com");
  assert.equal(model.cases[0].code, "TC-001");
  assert.equal(model.summary.total, 1);
  assert.deepEqual(model.notes, ["Scope note."]);
});

const draft = (overrides: Partial<ScenarioCaseDraft> = {}): ScenarioCaseDraft => ({
  feature: "Checkout",
  title: "Pay with an expired card",
  type: "negative",
  priority: "high",
  page_url: "https://shop.example.com/pricing",
  preconditions: "",
  test_data: "Card 4000 0000 0000 0002, expiry last year",
  steps: ["Open the pricing page.", "Choose a plan and continue.", "Enter the expired card."],
  expected: "The payment is refused and a message explains that the card has expired.",
  ...overrides,
});

test("scenario drafts are kept only when a tester can run them, and only against crawled pages", () => {
  const pages = ["https://shop.example.com/", "https://shop.example.com/pricing"];
  const accepted = acceptScenarioCases(
    [
      draft(),
      draft({ title: "Short", expected: "Fine." }),
      draft({ title: "Needs one step only", steps: ["Open the page."] }),
      draft({ title: "Names a page nobody crawled", page_url: "https://evil.example.net/" }),
      draft({ title: "Title with\u0007 control\ncharacters", steps: ["Open\tit.", "   ", "Submit."] }),
    ],
    pages,
    "Fallback",
  );
  assert.equal(accepted.length, 3, "the short and single-step drafts are dropped");
  assert.equal(accepted[1].pageUrl, "https://shop.example.com/", "a page nobody crawled falls back to the first page of the batch");
  assert.equal(accepted[2].title, "Title with control characters");
  assert.deepEqual(accepted[2].steps, ["Open it.", "Submit."], "blank steps are removed and whitespace collapsed");
  assert.ok(accepted.every((c) => c.source === "ai" && c.observed === ""));
});

test("scenario drafts are capped per batch and filed under the feature they name", () => {
  const many = Array.from({ length: 30 }, (_, index) => draft({ title: `Scenario number ${index + 1}` }));
  const accepted = acceptScenarioCases(many, ["https://shop.example.com/"], "Fallback", 12);
  assert.equal(accepted.length, 12);
  assert.equal(accepted[0].feature, "Checkout");
  const unnamed = acceptScenarioCases([draft({ feature: "   ", title: "Unnamed feature case" })], ["https://shop.example.com/"], "Pricing (/pricing)");
  assert.equal(unnamed[0].feature, "Pricing (/pricing)");
});
