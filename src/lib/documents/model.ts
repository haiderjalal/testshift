/**
 * The shape of a test case document, shared by the generators, the PDF and Word renderers and the web pages. Pure:
 * no network and no database, so the same rules hold everywhere.
 */

export const CASE_TYPES = ["smoke", "functional", "navigation", "negative", "boundary", "usability", "accessibility", "performance"] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Where a case came from. Readers need this to judge an expectation: a rule is observed, an AI scenario is drafted. */
export const CASE_SOURCES = ["crawl", "scan", "ai"] as const;
export type CaseSource = (typeof CASE_SOURCES)[number];

export const SOURCE_LABEL: Record<CaseSource, string> = {
  crawl: "Crawl rule",
  scan: "Accessibility scan",
  ai: "AI-drafted scenario",
};

export interface DocumentCase {
  feature: string;
  title: string;
  type: CaseType;
  priority: Priority;
  source: CaseSource;
  pageUrl: string;
  preconditions: string;
  testData: string;
  steps: string[];
  expected: string;
  /** What the crawl or scan actually saw, so a reader can compare it with the expectation. Empty when there is none. */
  observed: string;
}

export interface NumberedCase extends DocumentCase {
  /** Stable reference printed in the document, e.g. TC-004. */
  code: string;
}

export interface PageLine {
  url: string;
  title: string;
  status: number;
}

export interface DocumentSummary {
  total: number;
  byPriority: Record<Priority, number>;
  byType: Record<CaseType, number>;
  bySource: Record<CaseSource, number>;
  features: number;
}

export interface DocumentModel {
  siteUrl: string;
  host: string;
  generatedAt: Date;
  pages: PageLine[];
  cases: NumberedCase[];
  summary: DocumentSummary;
  /** Problems the crawl saw on the site itself (not third-party noise), shown as observations. */
  observations: string[];
  /** Scope and limits, so nobody reads the document as a claim of complete coverage. */
  notes: string[];
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const TYPE_RANK = new Map<CaseType, number>(CASE_TYPES.map((type, index) => [type, index]));

/**
 * Removes repeated cases (same title on the same page) and, when there are more than `max`, drops the lowest-priority
 * cases first. The cases kept keep their original order.
 */
export function selectCases(cases: DocumentCase[], max: number): DocumentCase[] {
  const seen = new Set<string>();
  const unique = cases.filter((c) => {
    const key = `${c.pageUrl}|${c.title.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length <= max) return unique;
  const kept = new Set(
    unique
      .map((c, index) => ({ c, index }))
      .sort((a, b) => PRIORITY_RANK[a.c.priority] - PRIORITY_RANK[b.c.priority] || a.index - b.index)
      .slice(0, max)
      .map((entry) => entry.index),
  );
  return unique.filter((_, index) => kept.has(index));
}

/** Groups cases by feature in the order the features first appear, then by priority and type. */
export function orderCases(cases: DocumentCase[]): DocumentCase[] {
  const firstSeen = new Map<string, number>();
  cases.forEach((c, index) => {
    if (!firstSeen.has(c.feature)) firstSeen.set(c.feature, index);
  });
  return cases
    .map((c, index) => ({ c, index }))
    .sort(
      (a, b) =>
        (firstSeen.get(a.c.feature) ?? 0) - (firstSeen.get(b.c.feature) ?? 0) ||
        PRIORITY_RANK[a.c.priority] - PRIORITY_RANK[b.c.priority] ||
        (TYPE_RANK.get(a.c.type) ?? 0) - (TYPE_RANK.get(b.c.type) ?? 0) ||
        a.index - b.index,
    )
    .map((entry) => entry.c);
}

/** Printed references run in reading order: TC-001, TC-002, and so on. */
export function numberCases(cases: DocumentCase[]): NumberedCase[] {
  return cases.map((c, index) => ({ ...c, code: `TC-${String(index + 1).padStart(3, "0")}` }));
}

export function summarize(cases: DocumentCase[]): DocumentSummary {
  const summary: DocumentSummary = {
    total: cases.length,
    byPriority: { high: 0, medium: 0, low: 0 },
    byType: Object.fromEntries(CASE_TYPES.map((type) => [type, 0])) as Record<CaseType, number>,
    bySource: { crawl: 0, scan: 0, ai: 0 },
    features: new Set(cases.map((c) => c.feature)).size,
  };
  for (const c of cases) {
    summary.byPriority[c.priority] += 1;
    summary.byType[c.type] += 1;
    summary.bySource[c.source] += 1;
  }
  return summary;
}

/** The complete model for one document: ordered, numbered and summarised. */
export function buildModel(input: {
  siteUrl: string;
  generatedAt: Date;
  pages: PageLine[];
  cases: DocumentCase[];
  observations: string[];
  notes: string[];
}): DocumentModel {
  const cases = numberCases(orderCases(input.cases));
  return {
    siteUrl: input.siteUrl,
    host: new URL(input.siteUrl).hostname,
    generatedAt: input.generatedAt,
    pages: input.pages,
    cases,
    summary: summarize(cases),
    observations: input.observations,
    notes: input.notes,
  };
}
