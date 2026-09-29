/**
 * The four agents customers see. In the backend they are one AI tester working a shift in four phases,
 * each with its own test type and instructions. Order matters: it is the order the phases run in.
 */
export const AGENTS = [
  {
    id: "dev",
    name: "Dev agent",
    env: "Development",
    testType: "Unit tests",
    share: 0.3,
    color: "var(--color-dev)",
    tagline: "Checks every part on its own.",
    checks: ["Each form field and its validation", "Buttons, links and toggles one by one", "Single components and their states"],
    focus:
      "You are running UNIT-LEVEL UI tests. Each test checks exactly one unit in isolation: one field's validation rule, one button's behaviour, one link's destination, one component's state. Keep tests short (1 to 4 steps) and assert one behaviour each.",
  },
  {
    id: "staging",
    name: "Staging agent",
    env: "Staging",
    testType: "Integration tests",
    share: 0.25,
    color: "var(--color-staging)",
    tagline: "Checks the parts work together.",
    checks: ["Forms reach their confirmation", "Search, filters and lists stay in sync", "Data survives reloads and navigation"],
    focus:
      "You are running INTEGRATION tests. Each test checks that two or more parts work together: a form submission reaching its confirmation, search feeding results, filters updating a list, a cart total updating, state persisting across navigation or reload.",
  },
  {
    id: "uat",
    name: "UAT agent",
    env: "User acceptance",
    testType: "End-to-end tests",
    share: 0.3,
    color: "var(--color-uat)",
    tagline: "Uses your site like a real customer.",
    checks: ["Complete journeys from landing to goal", "Acceptance criteria in plain language", "Desktop and mobile customers"],
    focus:
      "You are running END-TO-END user acceptance tests. Each test is a complete journey a real customer would take, from arriving on the site to reaching their goal, with a clear acceptance criterion at the end.",
  },
  {
    id: "prod",
    name: "Prod agent",
    env: "Production",
    testType: "Smoke tests",
    share: 0.15,
    color: "var(--color-prod)",
    tagline: "Gives the go / no-go for release.",
    checks: ["Every page loads fast and error-free", "Critical paths still work", "Release readiness verdict"],
    focus:
      "You are running production SMOKE tests: fast go/no-go checks of the most critical paths only. Each test confirms a key page shows its main content or a primary call to action works. Keep them short and decisive.",
  },
] as const;

export type Agent = (typeof AGENTS)[number];
export type AgentId = Agent["id"];
export const AGENT_IDS = AGENTS.map((a) => a.id) as [AgentId, ...AgentId[]];

export const agentById = (id: AgentId): Agent => AGENTS.find((a) => a.id === id) ?? AGENTS[0];

/** Splits a shift into the four agents' time windows, in pipeline order. */
export function agentWindows(start: number, end: number): { agent: Agent; from: number; to: number }[] {
  let cursor = start;
  return AGENTS.map((agent) => {
    const from = cursor;
    cursor += (end - start) * agent.share;
    return { agent, from, to: cursor };
  });
}
