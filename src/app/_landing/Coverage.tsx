import { PLANS, PLAN_IDS, type PlanId } from "@/lib/plans";

import { CoverageMatrix, type CoverageRow } from "./CoverageMatrix";

type PlanCheck = keyof (typeof PLANS)[PlanId]["checks"];

interface CoverageItem {
  title: string;
  /** The plan flag the worker reads for this test. Null means every plan runs it. */
  check: PlanCheck | null;
  /** Extra condition beyond the plan, shown next to it. */
  condition?: string;
  body: string;
}

/**
 * What each shift tests. Availability is read from the same plan flags the worker uses, so this list cannot
 * promise a test on a plan that does not run it.
 */
const COVERAGE: CoverageItem[] = [
  {
    title: "Functional tests",
    check: null,
    body: "Unit-level, integration, end-to-end and smoke tests, written for your real pages and clicked through in a real browser.",
  },
  {
    title: "API checks",
    check: null,
    body: "We read your OpenAPI or Swagger description, or a Postman collection you paste, and test each read-only endpoint for status, response schema and latency. Requests that change data run only on an approved test environment.",
  },
  {
    title: "Mobile and edge cases",
    check: "mobile",
    body: "Phone-sized screens, invalid and boundary inputs, and empty and error states.",
  },
  {
    title: "Accessibility",
    check: "accessibility",
    body: "WCAG 2.2 AA rules on every page, plus a check that keyboard focus stays visible.",
  },
  {
    title: "Performance",
    check: "performance",
    body: "Load speed and layout shift on every page, and p50, p95 and p99 latency for your API.",
  },
  {
    title: "Visual regression",
    check: "visual",
    body: "Full-page screenshots compared pixel by pixel with the ones you approve, on desktop and mobile.",
  },
  {
    title: "Exploratory testing",
    check: "exploratory",
    body: "An agent explores your site step by step and turns what it actually observes into reproducible tests.",
  },
  {
    title: "Security review",
    check: "securityHeaders",
    body: "Security headers, cookie flags, TLS certificate, version disclosure and HTTPS redirects. Exposed-file and cross-origin probes run once you verify your domain.",
  },
  {
    title: "Load testing",
    check: "performance",
    condition: "approved test environments",
    body: "Light, capped load on a test environment you have verified and we have approved. Never on a site without that approval.",
  },
  {
    title: "Tests from your requirements",
    check: null,
    condition: "on request",
    body: "Paste user stories or acceptance criteria when you book. We review every generated test before it runs.",
  },
];

function availability(check: PlanCheck | null): string {
  if (!check) return "All plans";
  const first = PLAN_IDS.findIndex((id) => PLANS[id].checks[check]);
  if (first < 0) return "On request";
  const name = PLANS[PLAN_IDS[first]].name;
  return first === PLAN_IDS.length - 1 ? name : `${name} and up`;
}

export function Coverage() {
  const rows: CoverageRow[] = COVERAGE.map((item) => ({
    title: item.title,
    body: item.body,
    check: item.check,
    label: availability(item.check),
    condition: item.condition,
  }));

  return (
    <section id="coverage" data-stage="overview" aria-labelledby="coverage-heading" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-28 sm:px-8">
      <p className="reveal font-mono text-xs tracking-widest text-graphite uppercase">What a shift tests</p>
      <h2 id="coverage-heading" className="reveal mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl">
        Functional, API, visual, performance and security, in one shift.
      </h2>
      <p className="reveal mt-5 max-w-2xl text-lg text-graphite">
        Every test runs on our test worker: a dedicated server with a real browser, guarded so it cannot reach private networks or wander off your site. Nothing is installed on your side. A one-hour and an eight-hour shift use the same tools; longer shifts go deeper and cover more.
      </p>

      <CoverageMatrix rows={rows} />
    </section>
  );
}
