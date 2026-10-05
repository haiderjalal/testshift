import { AGENTS } from "./agents";
import { ASSERTIONS, BROWSER_ACTIONS, type BrowserAction, type Strategy, type TestCase } from "./db";

/** Validate at the execution boundary too: structured model output is untrusted input. */
export function validateAction(step: BrowserAction): void {
  if (!BROWSER_ACTIONS.includes(step.action)) throw new Error("Unknown browser action");
  if ((step.selector?.length ?? 0) > 500 || (step.value?.length ?? 0) > 4_096) throw new Error("Browser step is too large");
  if (["click", "dblclick", "fill", "select", "hover", "expect_visible", "expect_value", "expect_valid", "expect_enabled", "expect_checked", "expect_count"].includes(step.action) && !step.selector?.trim()) {
    throw new Error(`${step.action} needs a selector`);
  }
  if (["goto", "press", "expect_text", "expect_url"].includes(step.action) && !step.value?.trim()) {
    throw new Error(`${step.action} needs a non-empty value`);
  }
  if (step.action === "expect_hidden" && !step.selector?.trim() && !step.value?.trim()) throw new Error("expect_hidden needs a target");
  // Empty strings are legitimate boundary inputs, but a missing value is a malformed test.
  if (["fill", "select", "expect_value"].includes(step.action) && step.value === undefined) throw new Error(`${step.action} needs a value`);
  if (["expect_valid", "expect_enabled", "expect_checked"].includes(step.action) && !["true", "false"].includes(step.value ?? "")) throw new Error(`${step.action} needs true or false`);
  if (step.action === "expect_count" && !/^(0|[1-9]\d{0,3})$/.test(step.value ?? "")) throw new Error("expect_count needs a non-negative integer");
}

export function scopedUrl(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password && url.origin === origin ? url.href : null;
  } catch { return null; }
}

export const isEvaluated = (c: Pick<TestCase, "status">): boolean => c.status === "passed" || c.status === "failed";
export const hasAssertion = (actions: BrowserAction[]): boolean => actions.some((a) => ASSERTIONS.includes(a.action));
export function exactTextPattern(value: string): string {
  return "^\\s*" + value.trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+") + "\\s*$";
}
export function urlMatches(actual: string, expected: string): boolean {
  if (!expected.trim()) return false;
  const url = new URL(actual);
  if (expected.startsWith("#")) return url.hash === expected;
  if (expected.startsWith("?")) return url.search === expected;
  return url.href === new URL(expected, url.origin).href;
}

/** A last successful assertion before another interaction does not prove the final state. */
export function hasFinalAssertion(actions: BrowserAction[]): boolean {
  return actions.length > 0 && ASSERTIONS.includes(actions[actions.length - 1].action);
}

/** Reload/navigation can erase a bug. Check the changed state before destroying its evidence. */
export function hasUnverifiedTransition(actions: BrowserAction[]): boolean {
  let changed = false;
  for (const step of actions) {
    if (["goto", "reload", "back"].includes(step.action)) {
      if (changed) return true;
      changed = false;
    } else if (ASSERTIONS.includes(step.action)) changed = false;
    else if (["click", "dblclick", "fill", "press", "select"].includes(step.action)) changed = true;
  }
  return false;
}

/** The fields scoring needs; the leaderboard loads only these. */
export type ScoredCase = Pick<TestCase, "agent" | "feature" | "status" | "priority" | "severity">;

export function featureCoverage(cases: ScoredCase[], strategy: Strategy | null) {
  return (strategy?.features ?? []).map((feature) => {
    const own = cases.filter((c) => c.feature === feature.id);
    return { ...feature, passed: own.filter((c) => c.status === "passed").length,
      failed: own.filter((c) => c.status === "failed").length,
      blocked: own.filter((c) => c.status === "blocked").length,
      pending: own.filter((c) => c.status === "pending" || c.status === "running").length,
      covered: own.some(isEvaluated) };
  });
}

export function assessResults(cases: ScoredCase[], strategy: Strategy | null) {
  const evaluated = cases.filter(isEvaluated);
  const bugs = evaluated.filter((c) => c.status === "failed");
  const coverage = featureCoverage(cases, strategy);
  const gaps = [
    ...coverage.filter((f) => !f.covered).map((f) => `${f.id}: ${f.name} (${f.risk} risk) has no completed checks`),
    ...AGENTS.filter((a) => !evaluated.some((c) => c.agent === a.id)).map((a) => `${a.name} has no completed checks`),
    ...(!coverage.length ? ["No feature inventory was established"] : []),
    ...(cases.some((c) => !isEvaluated(c)) ? ["Some checks were blocked or not reached"] : []),
  ];
  const verdict = bugs.some((c) => c.severity === "critical")
    ? { label: "No-go", note: "Critical bugs block this release.", color: "var(--color-fail)" }
    : gaps.length
      ? { label: "Incomplete", note: "Coverage is incomplete; this shift cannot establish release readiness.", color: "var(--color-marker)" }
      : bugs.some((c) => c.severity === "major")
        ? { label: "Go with caution", note: "Major bugs should be fixed before release.", color: "var(--color-marker)" }
        : { label: "Go", note: "No critical or major bugs in the completed checks. Untested behavior may still contain defects.", color: "var(--color-pass)" };
  const weight = (c: ScoredCase) => c.priority === "high" ? 3 : c.priority === "medium" ? 2 : 1;
  const total = evaluated.reduce((n, c) => n + weight(c), 0);
  const score = total ? Math.round(100 * evaluated.filter((c) => c.status === "passed").reduce((n, c) => n + weight(c), 0) / total) : null;
  return { verdict, coverage, gaps, score, evaluated: evaluated.length };
}

/** A repeat with a different title still costs money. Compare scripts across every agent. */
export function caseKeys(c: Pick<TestCase, "title" | "start_url" | "viewport" | "expected" | "script">): string[] {
  const normal = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return [
    JSON.stringify([c.start_url, c.viewport, normal(c.title), normal(c.expected)]),
    ...(c.script.length ? [JSON.stringify([c.start_url, c.viewport, c.script.map((s) => [s.action, s.selector ?? "", s.value ?? ""])])] : []),
  ];
}
