/**
 * Test cases a person can run by hand, built from what the crawl and the accessibility scan saw. Nothing is guessed:
 * each expectation comes from the page's own structure (headings, links, buttons and native form constraints), from
 * a standard the browser enforces, or from the scan's findings. Pure: the worker supplies the crawl and the scan.
 */
import { z } from "zod";

import type { SitePage } from "@/lib/db";

import type { CaseType, DocumentCase, Priority } from "./model";

/** Pages slower than this are reported as a performance case. */
export const LOAD_BUDGET_MS = 3_000;
const MAX_LINK_CASES = 40;
const MAX_BUTTON_CASES = 40;
const MAX_FIELD_CASES_PER_PAGE = 16;
const MAX_NAME_LENGTH = 80;
/** The label a crawl gives a grouped set of cases that belong to the whole site, not one page. */
export const SITE_FEATURE = "Whole site";
/** Tags the crawl puts on problems caused by third parties (analytics, ads). They are not the site's own. */
const THIRD_PARTY_TAG = "[third-party] ";
const CONSTRAINTS_PREFIX = "Observed field constraints: ";
const ERROR_PATH = "/testshift-page-that-should-not-exist";

/** An accessibility finding for one page, in the shape the scan returns. */
export interface ScanFinding {
  url: string;
  blocked?: string;
  violations: { id: string; impact: string | null; help: string; count: number }[];
}

/** One form field as the crawl recorded it. Attributes arrive as strings, and a boolean attribute is an empty string. */
const FieldConstraint = z.object({
  label: z.string(),
  id: z.string(),
  type: z.string().optional(),
  required: z.string().optional(),
  min: z.string().optional(),
  max: z.string().optional(),
  minlength: z.string().optional(),
  maxlength: z.string().optional(),
  pattern: z.string().optional(),
  disabled: z.string().optional(),
  readonly: z.string().optional(),
});
type Field = z.infer<typeof FieldConstraint>;

const HEADING = /^\s*- heading "((?:[^"\\]|\\.)*)"(.*)$/;
const LINK = /^\s*- link "((?:[^"\\]|\\.)*)"/;
const BUTTON = /^\s*- button "((?:[^"\\]|\\.)*)"/;
const URL_LINE = /^\s*- \/url: (.+)$/;

const unescapeName = (raw: string): string => raw.replace(/\\(.)/g, "$1").replace(/\s+/g, " ").trim();
const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
/** A page's path for titles and labels. Clipped, so one very long address cannot exceed a stored column. */
const pathOf = (url: string): string => clip(new URL(url).pathname || "/", 120);
const cleanName = (raw: string): string => clip(unescapeName(raw), MAX_NAME_LENGTH);

/** The feature a page's cases are filed under: its title with its path, so two pages with one title stay apart. */
export function featureOf(page: Pick<SitePage, "url" | "title">): string {
  const title = page.title.trim();
  return title ? `${clip(title, 60)} (${pathOf(page.url)})` : pathOf(page.url);
}

export function fieldsOf(outline: string): Field[] {
  const line = outline.split("\n").find((text) => text.startsWith(CONSTRAINTS_PREFIX));
  if (!line) return [];
  try {
    return z.array(FieldConstraint).parse(JSON.parse(line.slice(CONSTRAINTS_PREFIX.length))).slice(0, 40);
  } catch {
    return [];
  }
}

export function headingsOf(outline: string): { text: string; level: number | null }[] {
  return outline.split("\n").flatMap((line) => {
    const match = line.match(HEADING);
    if (!match) return [];
    const level = match[2].match(/\[level=(\d)\]/);
    return [{ text: cleanName(match[1]), level: level ? Number(level[1]) : null }];
  });
}

/** Links with their targets. The accessibility tree lists a link's target on the line directly below it. */
export function linksOf(outline: string): { name: string; href: string | null }[] {
  const lines = outline.split("\n");
  return lines.flatMap((line, index) => {
    const match = line.match(LINK);
    if (!match || !unescapeName(match[1])) return [];
    const href = lines[index + 1]?.match(URL_LINE)?.[1]?.trim() ?? null;
    return [{ name: cleanName(match[1]), href }];
  });
}

export function buttonsOf(outline: string): string[] {
  return outline.split("\n").flatMap((line) => {
    const match = line.match(BUTTON);
    return match && unescapeName(match[1]) ? [cleanName(match[1])] : [];
  });
}

const fieldLabel = (field: Field, index: number): string => {
  const named = field.label.trim() || field.id.trim();
  return named ? clip(named, MAX_NAME_LENGTH) : `field ${index + 1} (${field.type ?? "text"})`;
};

const numberOf = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const isBlocked = (status: number): boolean => [401, 403, 429].includes(status);
const isLoaded = (status: number): boolean => status >= 200 && status < 400;

function observedIssue(page: SitePage): string {
  const own = page.issues.filter((issue) => !issue.startsWith(THIRD_PARTY_TAG));
  return own.length > 0 ? ` ${own.length} problem(s) recorded, first: ${clip(own[0], 160)}` : "";
}

function loadCase(page: SitePage, feature: string): DocumentCase {
  const path = pathOf(page.url);
  const status = page.status ? `HTTP ${page.status} during the scan` : "No response during the scan";
  const note = isBlocked(page.status) ? " The page may need a login, so it was not explored further." : "";
  return {
    feature,
    title: `Open ${path} and confirm it loads`,
    type: "smoke",
    priority: "high",
    source: "crawl",
    pageUrl: page.url,
    preconditions: "",
    testData: "",
    steps: [`Enter ${page.url} in the browser address bar.`, "Press Enter and wait until the page finishes loading."],
    expected: "The page loads without an error page, and the browser console shows no uncaught errors.",
    observed: `${status}.${note}${observedIssue(page)}`,
  };
}

function titleCase(page: SitePage, feature: string): DocumentCase {
  const path = pathOf(page.url);
  const title = page.title.trim();
  return {
    feature,
    title: `Confirm the browser tab title of ${path}`,
    type: "functional",
    priority: title ? "low" : "medium",
    source: "crawl",
    pageUrl: page.url,
    preconditions: "",
    testData: "",
    steps: [`Open ${page.url}.`, "Read the title shown on the browser tab."],
    expected: title ? `The tab title reads "${clip(title, 120)}".` : "The page has a non-empty title.",
    observed: title ? `Title seen during the scan: "${clip(title, 120)}".` : "No page title was found during the scan.",
  };
}

/** Headings are checked only when the outline is complete: a cut-off outline could hide the real main heading. */
function headingCase(page: SitePage, feature: string): DocumentCase | null {
  const headings = headingsOf(page.outline);
  if (headings.length === 0) return null;
  const h1s = headings.filter((heading) => heading.level === 1);
  const path = pathOf(page.url);
  if (h1s.length === 1) {
    return {
      feature,
      title: `Confirm the main heading of ${path}`,
      type: "accessibility",
      priority: "medium",
      source: "crawl",
      pageUrl: page.url,
      preconditions: "",
      testData: "",
      steps: [`Open ${page.url}.`, "Read the largest heading at the top of the main content."],
      expected: `The page has one H1 heading, which reads "${h1s[0].text}".`,
      observed: `One H1 heading was found: "${h1s[0].text}".`,
    };
  }
  if (page.outline.includes("(truncated)")) return null;
  return {
    feature,
    title: `Check that ${path} has exactly one H1 heading`,
    type: "accessibility",
    priority: "medium",
    source: "crawl",
    pageUrl: page.url,
    preconditions: "",
    testData: "",
    steps: [`Open ${page.url}.`, "Look for the main heading of the page, and check how many H1 headings it has."],
    expected: "The page has exactly one H1 heading.",
    observed: h1s.length === 0 ? "No H1 heading was found during the scan." : `${h1s.length} H1 headings were found during the scan.`,
  };
}

function performanceCase(page: SitePage, feature: string): DocumentCase {
  const slow = page.loadMs > LOAD_BUDGET_MS;
  return {
    feature,
    title: `Confirm ${pathOf(page.url)} finishes loading within ${LOAD_BUDGET_MS / 1_000} seconds`,
    type: "performance",
    priority: slow ? "high" : "medium",
    source: "crawl",
    pageUrl: page.url,
    preconditions: "A normal broadband connection, and an empty browser cache.",
    testData: "",
    steps: [`Open ${page.url} in a new browser window.`, "Start a timer as you press Enter, and stop it when the page has finished loading."],
    expected: `The page finishes loading within ${LOAD_BUDGET_MS / 1_000} seconds.`,
    observed: `Loaded in ${Math.round(page.loadMs)} ms during the scan.`,
  };
}

function mobileCase(page: SitePage, feature: string): DocumentCase {
  const path = pathOf(page.url);
  return {
    feature,
    title: `Check ${path} on a phone-sized screen`,
    type: "usability",
    priority: "medium",
    source: "crawl",
    pageUrl: page.url,
    preconditions: "",
    testData: "Screen width 375 × 812 pixels.",
    steps: [
      `Open ${page.url} with the browser's device mode set to 375 × 812 pixels.`,
      "Scroll from the top of the page to the bottom.",
      "Open the main menu, if the page has one, and select a link.",
    ],
    expected: "The page fits the screen width with no sideways scrolling, text is readable without zooming, and menus and links work by touch.",
    observed: "",
  };
}

function keyboardCase(page: SitePage, feature: string, hasControls: boolean): DocumentCase {
  return {
    feature,
    title: `Use ${pathOf(page.url)} with the keyboard only`,
    type: "accessibility",
    priority: hasControls ? "medium" : "low",
    source: "crawl",
    pageUrl: page.url,
    preconditions: "",
    testData: "",
    steps: [
      `Open ${page.url}.`,
      "Do not use the mouse. Press Tab to move forward through the page, and Shift + Tab to move back.",
      "Activate a link or button with Enter or Space.",
    ],
    expected: "Focus moves in a logical order, every focused element shows a visible focus indicator, and focus never gets stuck.",
    observed: "",
  };
}

/** One set of cases for a form field, from the native constraints the field declares. */
function fieldCases(page: SitePage, feature: string, field: Field, index: number): DocumentCase[] {
  if (field.disabled !== undefined || field.readonly !== undefined) return [];
  const name = fieldLabel(field, index);
  const path = pathOf(page.url);
  const base = { feature, pageUrl: page.url, preconditions: "", source: "crawl" as const, observed: "" };
  const form = [`Open ${page.url}.`];
  const cases: DocumentCase[] = [];
  const add = (c: Omit<DocumentCase, "feature" | "pageUrl" | "preconditions" | "source" | "observed">, observed = "") =>
    cases.push({ ...base, ...c, observed });

  const kind = field.type ?? "text";
  if (field.required !== undefined) {
    const empty = kind === "checkbox" || kind === "radio" ? "unchecked" : "empty";
    add({
      title: `Submit ${path} with "${name}" ${empty}`,
      type: "negative",
      priority: "high",
      testData: `"${name}" ${empty}; the other required fields hold valid test data.`,
      steps: [...form, `Leave "${name}" ${empty}.`, "Fill in every other required field with valid test data.", "Press the form's submit button."],
      expected: `The form is not submitted, and "${name}" is marked as required with a message next to it.`,
    }, `Required attribute present (${kind} field).`);
  }
  if (kind === "email") {
    add({
      title: `Enter an invalid email address in "${name}"`,
      type: "negative",
      priority: "high",
      testData: "not-an-email",
      steps: [...form, `Enter "not-an-email" in "${name}".`, "Press the form's submit button."],
      expected: `The form is not submitted, and "${name}" reports that the email address is not valid.`,
    }, "Input type is email.");
  }
  if (kind === "url") {
    add({
      title: `Enter an invalid web address in "${name}"`,
      type: "negative",
      priority: "medium",
      testData: "not a web address",
      steps: [...form, `Enter "not a web address" in "${name}".`, "Press the form's submit button."],
      expected: `The form is not submitted, and "${name}" reports that the web address is not valid.`,
    }, "Input type is url.");
  }
  if (kind === "number" || kind === "range") {
    const min = numberOf(field.min);
    const max = numberOf(field.max);
    const limits = `Limits: ${min ?? "none"} to ${max ?? "none"}.`;
    if (min !== null) {
      add({
        title: `Enter ${min - 1} in "${name}", just below the minimum`,
        type: "boundary",
        priority: "medium",
        testData: String(min - 1),
        steps: [...form, `Enter ${min - 1} in "${name}".`, "Press the form's submit button."],
        expected: `The form is not submitted, and "${name}" explains the allowed range.`,
      }, limits);
      add({
        title: `Enter ${min} in "${name}", the minimum`,
        type: "boundary",
        priority: "medium",
        testData: String(min),
        steps: [...form, `Enter ${min} in "${name}".`, "Press the form's submit button."],
        expected: `The value ${min} is accepted and no validation message is shown for "${name}".`,
      }, limits);
    }
    if (max !== null) {
      add({
        title: `Enter ${max} in "${name}", the maximum`,
        type: "boundary",
        priority: "medium",
        testData: String(max),
        steps: [...form, `Enter ${max} in "${name}".`, "Press the form's submit button."],
        expected: `The value ${max} is accepted and no validation message is shown for "${name}".`,
      }, limits);
      add({
        title: `Enter ${max + 1} in "${name}", just above the maximum`,
        type: "boundary",
        priority: "medium",
        testData: String(max + 1),
        steps: [...form, `Enter ${max + 1} in "${name}".`, "Press the form's submit button."],
        expected: `The form is not submitted, and "${name}" explains the allowed range.`,
      }, limits);
    }
    if (min === null && max === null) {
      add({
        title: `Enter letters in the numeric field "${name}"`,
        type: "negative",
        priority: "medium",
        testData: "abc",
        steps: [...form, `Try to enter "abc" in "${name}".`, "Press the form's submit button."],
        expected: `The field rejects the letters, and the form is not submitted.`,
      }, "Input type is number.");
    }
  }
  const maxlength = numberOf(field.maxlength);
  if (maxlength !== null && maxlength > 0 && maxlength <= 1_000) {
    add({
      title: `Type more than ${maxlength} characters into "${name}"`,
      type: "boundary",
      priority: "low",
      testData: `${maxlength + 1} characters, for example the letter a repeated.`,
      steps: [...form, `Type ${maxlength + 1} characters into "${name}".`, "Check how many characters the field keeps."],
      expected: `The field keeps at most ${maxlength} characters.`,
    }, `Maximum length ${maxlength}.`);
  }
  const minlength = numberOf(field.minlength);
  if (minlength !== null && minlength >= 2 && minlength <= 1_000) {
    add({
      title: `Submit "${name}" with fewer than ${minlength} characters`,
      type: "boundary",
      priority: "medium",
      testData: `${minlength - 1} characters.`,
      steps: [...form, `Enter ${minlength - 1} characters in "${name}".`, "Press the form's submit button."],
      expected: `The form is not submitted, and "${name}" reports the minimum length of ${minlength}.`,
    }, `Minimum length ${minlength}.`);
  }
  if (field.pattern !== undefined && field.pattern !== "") {
    add({
      title: `Enter a value in the wrong format in "${name}"`,
      type: "negative",
      priority: "medium",
      testData: "A value that breaks the format in the observed pattern.",
      steps: [...form, `Enter a value in "${name}" that does not match the format the field expects.`, "Press the form's submit button."],
      expected: `The form is not submitted, and "${name}" explains the expected format.`,
    }, `Required pattern: ${clip(field.pattern, 120)}`);
  }
  return cases;
}

/** Cases that follow from one loaded page: its title, headings, speed, layout, keyboard use, forms, links and buttons. */
function pageCases(page: SitePage, origin: URL, links: Map<string, true>, buttons: Map<string, true>): DocumentCase[] {
  const feature = featureOf(page);
  const cases: DocumentCase[] = [loadCase(page, feature)];
  if (!isLoaded(page.status)) return cases;

  cases.push(titleCase(page, feature));
  const heading = headingCase(page, feature);
  if (heading) cases.push(heading);
  cases.push(performanceCase(page, feature));
  cases.push(mobileCase(page, feature));
  const fields = fieldsOf(page.outline);
  const pageButtons = buttonsOf(page.outline);
  cases.push(keyboardCase(page, feature, fields.length > 0 || pageButtons.length > 0));
  fields.slice(0, MAX_FIELD_CASES_PER_PAGE).forEach((field, index) => cases.push(...fieldCases(page, feature, field, index)));

  for (const link of linksOf(page.outline)) {
    const key = `${link.name}|${link.href ?? ""}`;
    if (links.has(key) || links.size >= MAX_LINK_CASES) continue;
    links.set(key, true);
    const target = link.href ? resolveTarget(link.href, origin) : null;
    cases.push({
      feature,
      title: `Follow the link "${link.name}" on ${pathOf(page.url)}`,
      type: "navigation",
      priority: "low",
      source: "crawl",
      pageUrl: page.url,
      preconditions: "",
      testData: "",
      steps: [`Open ${page.url}.`, `Select the link "${link.name}".`],
      expected: target ? `The browser goes to ${target}, and that page loads without an error.` : "The link opens the page it describes, and that page loads without an error.",
      observed: link.href ? `Target seen during the scan: ${clip(link.href, 200)}.` : "",
    });
  }
  for (const name of pageButtons) {
    if (buttons.has(name) || buttons.size >= MAX_BUTTON_CASES) continue;
    buttons.set(name, true);
    cases.push({
      feature,
      title: `Select the "${name}" button on ${pathOf(page.url)}`,
      type: "functional",
      priority: "low",
      source: "crawl",
      pageUrl: page.url,
      preconditions: "",
      testData: "",
      steps: [`Open ${page.url}.`, `Select the "${name}" button.`],
      expected: "The button does what its label says: the page changes, a dialog opens, or a clear message appears. Nothing happens silently.",
      observed: "",
    });
  }
  return cases;
}

function resolveTarget(href: string, origin: URL): string | null {
  try {
    return clip(new URL(href, origin).href, 200);
  } catch {
    return null;
  }
}

/**
 * Every case the crawl supports. Each page gets a load check; loaded pages also get the checks their structure allows.
 * One missing-page check covers the whole site.
 */
export function ruleCases(pages: SitePage[], origin: URL): DocumentCase[] {
  const links = new Map<string, true>();
  const buttons = new Map<string, true>();
  const cases = pages.flatMap((page) => pageCases(page, origin, links, buttons));
  const missing = new URL(ERROR_PATH, origin).href;
  cases.push({
    feature: SITE_FEATURE,
    title: "Open a page that does not exist",
    type: "negative",
    priority: "low",
    source: "crawl",
    pageUrl: missing,
    preconditions: "",
    testData: `Any address that is not a page, such as ${ERROR_PATH}.`,
    steps: [`Enter ${missing} in the browser address bar.`, "Press Enter and wait for the page to load."],
    expected: "The site shows a clear 'page not found' message with a way back to the home page, and the HTTP status is 404.",
    observed: "",
  });
  return cases;
}

const IMPACT_PRIORITY: Record<string, Priority> = { critical: "high", serious: "high", moderate: "medium", minor: "low" };

/** One case per accessibility rule that the scan found broken on a page. */
export function scanCases(findings: ScanFinding[], pages: SitePage[]): DocumentCase[] {
  const feature = new Map(pages.map((page) => [page.url, featureOf(page)]));
  return findings.flatMap((finding) => {
    if (finding.blocked) return [];
    const path = pathOf(finding.url);
    return finding.violations.map((violation): DocumentCase => {
      const type: CaseType = "accessibility";
      return {
        feature: feature.get(finding.url) ?? path,
        title: `Accessibility: ${clip(violation.help, 100)} on ${path}`,
        type,
        priority: IMPACT_PRIORITY[violation.impact ?? ""] ?? "low",
        source: "scan",
        pageUrl: finding.url,
        preconditions: "",
        testData: "",
        steps: [
          `Open ${finding.url}.`,
          "Run an accessibility checker, such as axe DevTools, against the page with the WCAG 2.2 AA rules.",
          `Look for the rule "${clip(violation.help, 100)}" in the results.`,
        ],
        expected: `No element on the page breaks the rule: ${violation.help}.`,
        observed: `The scan found ${violation.count} element(s) breaking this rule (impact: ${violation.impact ?? "not stated"}).`,
      };
    });
  });
}

/** Problems the crawl recorded on the site's own pages, for the observations section. */
export function observationsOf(pages: SitePage[], limit = 60): string[] {
  return pages.flatMap((page) =>
    page.issues
      .filter((issue) => !issue.startsWith(THIRD_PARTY_TAG))
      .map((issue) => `${pathOf(page.url)}: ${clip(issue, 240)}`),
  ).slice(0, limit);
}
