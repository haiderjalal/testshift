/**
 * Caps on test case documents. Each has a conservative default and can be changed with an environment variable. An
 * invalid value throws, so a typo can't quietly remove a limit that protects the AI budget.
 */
export interface DocumentLimits {
  /** Test cases per document. The least important cases are dropped first when there are more. */
  maxCases: number;
  /** Pages crawled per document. */
  maxPages: number;
  /** Model spend allowed per document, in USD. Zero turns scenario drafting off. */
  maxAiUsd: number;
  /** Documents one visitor can request in a day. */
  perVisitorPerDay: number;
  /** Documents for one website in a day. */
  perSitePerDay: number;
  /** Documents for everyone in a day. */
  perDay: number;
}

type Env = Record<string, string | undefined>;

export function documentLimits(env: Env = process.env): DocumentLimits {
  const read = (name: string, fallback: number, min: number, max: number): number => {
    const raw = env[name];
    const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
    return value;
  };
  return {
    maxCases: Math.floor(read("DOCUMENT_MAX_CASES", 300, 10, 1_000)),
    maxPages: Math.floor(read("DOCUMENT_MAX_PAGES", 25, 1, 50)),
    maxAiUsd: read("DOCUMENT_MAX_AI_USD", 1, 0, 50),
    perVisitorPerDay: Math.floor(read("DOCUMENTS_PER_VISITOR_PER_DAY", 3, 1, 100)),
    perSitePerDay: Math.floor(read("DOCUMENTS_PER_SITE_PER_DAY", 2, 1, 100)),
    perDay: Math.floor(read("MAX_DOCUMENTS_PER_DAY", 40, 1, 10_000)),
  };
}
