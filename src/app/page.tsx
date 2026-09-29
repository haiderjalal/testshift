import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";
import { UrlForm } from "@/components/UrlForm";
import { PLANS, SITE, TRIAL_MINUTES, type PlanId } from "@/lib/plans";

import { HeroScene } from "./HeroScene";
import { ReportStack } from "./ReportStack";

const STEPS = [
  { title: "Paste your link", body: "Any public website or web app. No code access, no setup." },
  { title: "Book the hours", body: `Start with ${TRIAL_MINUTES} free minutes, then book one to eight hours. The tester works the whole shift.` },
  { title: "Get the report", body: "Every test it ran, what broke, and exactly how to reproduce it." },
];

const DELIVERABLES = [
  { label: "Test plan", body: "Test cases written for your site's real pages, forms and journeys, highest-risk first." },
  { label: "Real-browser runs", body: "Each case is clicked through in Chrome, on desktop and mobile screen sizes." },
  { label: "Bug report", body: "Failures ranked by severity, with steps to reproduce, what should have happened, and a screenshot." },
  { label: "Playwright suite", body: "Every test it ran, exported as code you can drop into your CI and run on each release." },
];

const FAQS = [
  {
    q: "Do you need access to my code?",
    a: "No. The tester uses your site the way a customer does, through a real browser. Unit tests need your source code; connecting a GitHub repository is on our roadmap.",
  },
  {
    q: "What happens when the shift ends?",
    a: "The tester stops, writes up the report, and emails you a private link. You can watch the shift live on the same page while it runs.",
  },
  {
    q: "Is it safe to run on my live site?",
    a: "It fills forms with obvious test data, never enters card details, and avoids irreversible actions. If a form places orders or emails real people, point it at a staging URL instead.",
  },
  {
    q: "Can it test pages behind a login?",
    a: "Not yet. It tests public pages and sign-up flows today. Test accounts are coming next.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">
        <section className="relative grid items-center gap-12 pt-10 pb-20 lg:grid-cols-[1fr_1.05fr] lg:gap-10 lg:pt-14 lg:pb-28">
          <div aria-hidden className="sheet-grid pointer-events-none absolute -inset-x-40 -top-24 bottom-0 -z-10" />
          <div>
            <p className="rise font-mono text-xs tracking-wide text-graphite">
              <span className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-pass align-middle" />
              AI QA engineer · billed by the hour
            </p>
            <h1 className="rise mt-5 text-5xl leading-[0.95] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-7xl" style={{ ["--d" as string]: 1 }}>
              Rent a QA engineer <span className="marker whitespace-nowrap">by the hour.</span>
            </h1>
            <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-graphite" style={{ ["--d" as string]: 2 }}>
              Paste your website&apos;s link and book a shift. Our AI tester writes the test cases, runs them in a real
              browser for every hour you book, and sends you a bug report with steps to reproduce.
            </p>
            <div className="rise mt-8" style={{ ["--d" as string]: 3 }}>
              <UrlForm id="hero-url" />
            </div>
            <p className="rise mt-3 pl-1 text-sm text-graphite" style={{ ["--d" as string]: 4 }}>
              <span className="font-medium text-pass">First {TRIAL_MINUTES} minutes free.</span> Then from $30 an hour, no card to start.
            </p>
          </div>
          <HeroScene />
        </section>

        <section id="how-it-works" className="scroll-mt-8 border-t border-rule py-24">
          <h2 className="reveal text-3xl font-semibold tracking-tight sm:text-4xl">How a shift works</h2>
          <div className="steps relative mt-12">
            <div aria-hidden className="absolute top-4 right-[16%] left-4 hidden h-px bg-rule sm:block">
              <div className="step-fill h-full origin-left bg-ink" />
            </div>
            <ol className="grid gap-10 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="reveal relative">
                  <span
                    style={{ ["--i" as string]: i }}
                    className="step-dot relative grid size-8 place-items-center rounded-full border border-ink bg-ink font-mono text-sm text-paper"
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 max-w-xs leading-relaxed text-graphite">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="grid items-center gap-10 border-t border-rule py-24 lg:grid-cols-2">
          <div>
            <h2 className="reveal text-3xl font-semibold tracking-tight sm:text-4xl">What you get when the shift ends</h2>
            <dl className="mt-10 space-y-7">
              {DELIVERABLES.map((d) => (
                <div key={d.label} className="reveal border-l-2 border-ink pl-5">
                  <dt className="font-semibold">{d.label}</dt>
                  <dd className="mt-1 max-w-md leading-relaxed text-graphite">{d.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ReportStack />
        </section>

        <section id="pricing" className="scroll-mt-8 border-t border-rule py-24">
          <h2 className="reveal text-3xl font-semibold tracking-tight sm:text-4xl">Pay for the hours you book</h2>
          <p className="reveal mt-3 text-graphite">
            Your first {TRIAL_MINUTES}-minute shift is free, so you can see a real report first. After that, book one to eight hours: a
            3-hour Senior QA shift is $150.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {(Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).map(([id, plan]) => (
              <article
                key={id}
                className="reveal flex flex-col rounded-2xl border border-rule bg-card p-7 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(14,23,38,0.3)]"
              >
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 text-graphite">{plan.pitch}</p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-semibold tracking-tight">${plan.rate}</span>
                  <span className="text-graphite">/ hour</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <span aria-hidden className="font-mono text-pass">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/hire?plan=${id}`}
                  className="mt-8 rounded-full border border-ink px-5 py-3 text-center font-medium transition hover:bg-ink hover:text-paper"
                >
                  Book a {plan.name} shift
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className="scroll-mt-8 border-t border-rule py-24">
          <h2 className="reveal text-3xl font-semibold tracking-tight sm:text-4xl">Questions</h2>
          <div className="reveal mt-8 divide-y divide-rule border-y border-rule">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium">
                  {f.q}
                  <span aria-hidden className="font-mono text-graphite transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-3xl leading-relaxed text-graphite">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="reveal relative mb-16 overflow-hidden rounded-3xl bg-ink px-6 py-16 text-paper sm:px-12">
          <div aria-hidden className="sheet-grid pointer-events-none absolute inset-0 opacity-10" />
          <h2 className="relative max-w-2xl text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            Your next release deserves a <span className="rounded-lg bg-marker px-2 text-ink [box-decoration-break:clone]">second pair of eyes.</span>
          </h2>
          <p className="relative mt-4 max-w-xl text-paper/70">
            Your first {TRIAL_MINUTES} minutes are on us. Paste a link and see a real report before you pay anything.
          </p>
          <UrlForm id="cta-url" className="relative mt-8 [&_button]:bg-marker [&_button]:text-ink [&_button:hover]:bg-marker/85" />
        </section>
      </main>
      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-10 text-sm text-graphite sm:flex-row sm:justify-between sm:px-8">
        <p>
          © {new Date().getFullYear()} {SITE.name}
        </p>
        <p>Only test websites you own or have permission to test.</p>
      </footer>
    </>
  );
}
