export const SITE = {
  name: "TestShift",
  description:
    "Rent an AI QA engineer by the hour. It writes test cases, runs them in a real browser, and sends you a bug report.",
};

export const MODEL = "claude-opus-5-5";

/** Hourly plans. `effort` and `focus` steer the AI tester; everything else is shown to customers. */
export const PLANS = {
  junior: {
    name: "Junior QA",
    rate: 30,
    pitch: "Checks that your main flows work.",
    features: [
      "Smoke test of every page it can reach",
      "Functional and end-to-end tests of key journeys",
      "Bug list with steps to reproduce",
      "Playwright test suite to keep",
    ],
    effort: "low",
    focus:
      "Focus on the core user journeys: navigation, forms, sign-up, search, cart and checkout if present. Verify each works end to end.",
  },
  senior: {
    name: "Senior QA",
    rate: 50,
    pitch: "Digs into edge cases and polish.",
    features: [
      "Everything in Junior QA",
      "Negative and edge-case inputs",
      "Mobile viewport and accessibility checks",
      "Deeper reasoning on every test",
    ],
    effort: "high",
    focus:
      "Cover the core journeys first, then go deep: invalid and edge-case inputs, validation messages, mobile viewport behaviour, keyboard access and accessible names, empty and error states, and consistency across pages.",
  },
} as const;

export type PlanId = keyof typeof PLANS;

export const HOUR_OPTIONS = [1, 2, 3, 4, 6, 8] as const;
