/** Score colour shared by the podium and the rank rows: green is release-ready, yellow flags bugs, red is risky. */
export function scoreColor(score: number): string {
  if (score >= 85) return "var(--color-pass)";
  if (score >= 60) return "var(--color-marker)";
  return "var(--color-fail)";
}

export const bugLabel = (n: number): string => `${n} ${n === 1 ? "bug" : "bugs"}`;
