import Link from "next/link";

import { Logo } from "@/components/Logo";
import { SiteHeader } from "@/components/SiteHeader";
import { UrlForm } from "@/components/UrlForm";
import { SITE, TRIAL_MINUTES } from "@/lib/plans";
import { loadBetaPrices } from "@/lib/beta-orders";

export const dynamic = "force-dynamic";

import { Consoles } from "./_landing/Consoles";
import { Hero } from "./_landing/Hero";
import { Pipeline } from "./_landing/Pipeline";
import { Pricing } from "./_landing/Pricing";
import { ReportStack } from "./_landing/ReportStack";
import { Ticker } from "./_landing/Ticker";

const DELIVERABLES = [
  { label: "Test plan", body: "Every unit, integration, end-to-end and smoke test the agents wrote for your real pages." },
  { label: "Real-browser runs", body: "Each test clicked through in Chrome, on desktop and, on Senior and up, mobile." },
  { label: "Bug report", body: "Failures ranked by severity, with steps to reproduce, expected vs actual, and a screenshot." },
  { label: "Playwright suite", body: "Replayable browser checks with assertions, grouped by agent for your CI. Automated audits and coverage gaps stay in the report." },
];

const FAQS = [
  {
    q: "How do I pay during the beta?",
    a: "Request the hours you need, then email us with your order reference for onboarding and a Wise payment link. Your fixed hourly quote is 10 times our estimated AI token cost. We confirm payment and start your shift manually. No subscription, automatic top-up or surprise token invoice.",
  },
  {
    q: "Are there really four agents?",
    a: "It's one AI tester working your shift in four modes, one after another, each with its own test type and instructions: Dev runs unit-level tests, Staging integration tests, UAT end-to-end journeys and Prod smoke and release checks. Every test in your report says which agent ran it.",
  },
  {
    q: "How can you run unit tests without my code?",
    a: "The Dev agent tests each unit of your interface on its own through the browser: one field's validation, one button, one link. Unit tests against your source code need repository access, which is on our roadmap.",
  },
  {
    q: "Who tests my site?",
    a: "We have personalized agents that work in the background and test your app. Higher plans use more advanced agents that reason more deeply, with Principal running our most capable ones.",
  },
  {
    q: "Is it safe to run on my live site?",
    a: "The agents fill forms with obvious test data, never enter card details and avoid irreversible actions. If a form places orders or emails real people, point them at a staging URL instead.",
  },
  {
    q: "What happens when the shift ends?",
    a: "The Prod agent gives a go / no-go, the report is written, and you get a private link by email. You can watch the whole pipeline live on the same page.",
  },
  {
    q: "Can it test pages behind a login?",
    a: "Not yet. It tests public pages and sign-up flows today. Test accounts are coming next.",
  },
];

export default async function Home() {
  const prices = await loadBetaPrices();
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Ticker />
        <Pipeline />

        <section data-stage="overview" aria-labelledby="live-heading" className="mx-auto max-w-7xl px-5 py-28 sm:px-8">
          <p className="reveal font-mono text-xs tracking-widest text-graphite uppercase">Live shift</p>
          <h2 id="live-heading" className="reveal mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl">
            Watch every agent report as it works.
          </h2>
          <p className="reveal mt-5 max-w-xl text-lg text-graphite">
            Your shift page streams results from all four agents, with a clock, a progress bar and the agent on duty.
          </p>
          <Consoles />
        </section>

        <section data-stage="overview" aria-labelledby="deliver-heading" className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-28 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="reveal font-mono text-xs tracking-widest text-graphite uppercase">When the shift ends</p>
            <h2 id="deliver-heading" className="reveal mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl">
              What lands in your inbox.
            </h2>
            <div className="reveal mt-8 flex items-center gap-5">
              <div
                className="count-up grid size-24 shrink-0 place-items-center rounded-full font-display text-3xl font-semibold"
                style={{
                  ["--to" as string]: 82,
                  background:
                    "radial-gradient(closest-side, var(--color-paper) 82%, transparent 83%), conic-gradient(var(--color-dev) calc(var(--num) * 1%), var(--color-rule) 0)",
                }}
                aria-label="Sample quality score: 82 out of 100"
                role="img"
              />
              <p className="text-graphite">
                A quality score, a go / no-go from the Prod agent, and a verdict from each agent.{" "}
                <span className="text-ink/70">(Sample score.)</span>
              </p>
            </div>
            <dl className="mt-10 space-y-6">
              {DELIVERABLES.map((d) => (
                <div key={d.label} className="reveal border-l-2 border-dev/60 pl-5">
                  <dt className="font-semibold">{d.label}</dt>
                  <dd className="mt-1 max-w-md leading-relaxed text-graphite">{d.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ReportStack />
        </section>

        <Pricing prices={prices} />

        <section id="faq" data-stage="overview" aria-labelledby="faq-heading" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-24 sm:px-8">
          <h2 id="faq-heading" className="reveal font-display text-4xl font-semibold tracking-[-0.03em]">
            Questions
          </h2>
          <div className="mt-10 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="glass reveal group rounded-2xl px-6 py-5 open:border-dev/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium">
                  {f.q}
                  <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-rule font-mono text-graphite transition-transform duration-300 group-open:rotate-45 group-open:border-dev group-open:text-dev">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-3xl leading-relaxed text-graphite">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section data-stage="prod" className="px-5 pb-24 sm:px-8">
          <div className="glass reveal relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-20 sm:px-14">
            <div aria-hidden className="lab-grid pointer-events-none absolute inset-0" />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-40 -right-20 size-[32rem] rounded-full opacity-40 blur-3xl"
              style={{ background: "conic-gradient(var(--color-dev), var(--color-staging), var(--color-uat), var(--color-prod), var(--color-dev))" }}
            />
            <h2 className="relative max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-6xl">
              Put four agents on your next release.
            </h2>
            <p className="relative mt-5 max-w-xl text-lg text-graphite">
              Paste a link and watch the pipeline run. The first {TRIAL_MINUTES} minutes are on us.
            </p>
            <UrlForm id="cta-url" className="relative mt-9" />
          </div>
        </section>
      </main>

      <footer className="border-t border-rule/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 text-sm text-graphite sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <nav aria-label="Footer" className="flex flex-wrap gap-6">
            <Link href="/#agents" className="hover:text-ink">
              Agents
            </Link>
            <Link href="/#pricing" className="hover:text-ink">
              Pricing
            </Link>
            <Link href="/custom" className="hover:text-ink">
              Custom pricing
            </Link>
            <Link href="/#faq" className="hover:text-ink">
              FAQ
            </Link>
          </nav>
          <p>
            © {new Date().getFullYear()} {SITE.name} · Only test sites you own or may test.
          </p>
        </div>
      </footer>
    </>
  );
}
