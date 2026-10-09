/** Cross-browser comparison rules. Pure: the browsers themselves are driven by worker/browser.ts. */

export type EngineId = "chromium" | "firefox" | "webkit";

export interface EngineOutcome {
  engine: EngineId;
  status: number;
  /** The site's own console errors and crashes for this page. Third-party noise is already removed. */
  ownIssues: string[];
  /** Set when the tester's network policy stopped this engine from reading the page safely. */
  blocked: string | null;
}

export interface CompatibilityResult {
  url: string;
  outcomes: EngineOutcome[];
}

export interface CompatibilityJudgement {
  outcome: "passed" | "failed" | "not-comparable";
  severity: "major" | "minor" | null;
  detail: string;
}

const LABEL: Record<EngineId, string> = { chromium: "Chromium", firefox: "Firefox", webkit: "WebKit" };
const loaded = (status: number): boolean => status >= 200 && status < 300;

/**
 * A browser difference is only claimed when the browsers disagree. Errors that every browser shows are a site
 * bug (the smoke checks report those), and a page no browser loads is not a compatibility problem.
 */
export function judgeCompatibility(result: CompatibilityResult): CompatibilityJudgement {
  const ran = result.outcomes.filter((o) => o.blocked === null);
  if (ran.length < 2) {
    return { outcome: "not-comparable", severity: null, detail: "Fewer than two browsers could load this page." };
  }

  const ok = ran.filter((o) => loaded(o.status));
  if (ok.length === 0) {
    return { outcome: "not-comparable", severity: null, detail: "No browser loaded this page, so this is not a browser difference." };
  }
  if (ok.length < ran.length) {
    const failing = ran.filter((o) => !loaded(o.status)).map((o) => `${LABEL[o.engine]} returned HTTP ${o.status || "no response"}`);
    const working = ok.map((o) => LABEL[o.engine]).join(", ");
    return { outcome: "failed", severity: "major", detail: `${failing.join("; ")}, while ${working} loaded it.` };
  }

  const clean = ran.filter((o) => o.ownIssues.length === 0);
  const withErrors = ran.filter((o) => o.ownIssues.length > 0);
  if (clean.length === 0 || withErrors.length === 0) {
    return { outcome: "passed", severity: null, detail: `Loads the same way in ${ran.map((o) => LABEL[o.engine]).join(", ")}.` };
  }
  const first = withErrors[0];
  return {
    outcome: "failed",
    severity: "minor",
    detail: `${withErrors.map((o) => LABEL[o.engine]).join(", ")} reported errors that ${clean.map((o) => LABEL[o.engine]).join(", ")} did not. First: ${LABEL[first.engine]}: ${first.ownIssues[0]}`,
  };
}
