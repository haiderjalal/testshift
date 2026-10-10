const FAQS = [
  {
    q: "How do I pay during the beta?",
    a: "Request the hours you need, then email us with your order reference for onboarding and a Wise payment link. Your hourly quote is fixed before you pay. We confirm payment and start your shift manually. No subscription, automatic top-up or surprise invoice.",
  },
  {
    q: "Are there really four agents?",
    a: "It's one AI tester working your shift in four modes, one after another, each with its own test type and instructions: Dev runs unit-level tests, Staging integration tests, UAT end-to-end journeys and Prod smoke and release checks. Every test in your report says which agent ran it.",
  },
  {
    q: "Where does the testing happen?",
    a: "On our test worker: a dedicated server that runs a real browser against your site, the way a careful user would. Nothing is installed on your side. You can watch the shift live, and the report arrives by email when it ends.",
  },
  {
    q: "What runs in a one- or two-hour shift?",
    a: "Every shift maps your site, writes a test strategy and checks your API if it publishes an OpenAPI or Swagger description. Then the Dev, Staging, UAT and Prod agents test in turn until your time is up. Your plan adds the audits listed under What a shift tests. More hours mean more tests and deeper coverage, not different tools.",
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
    a: "The agents fill forms with obvious test data, never enter card details and avoid irreversible actions. Load tests and API requests that change data run only on a test environment you have verified and we have approved. If a form places orders or emails real people, point us at a staging URL instead.",
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

/**
 * Questions as numbered cases. The answer opens with a height animation where the browser supports it
 * (`::details-content`); elsewhere it simply opens, which is still fully usable.
 */
export function Faq() {
  return (
    <section id="faq" data-stage="overview" aria-labelledby="faq-heading" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-28 sm:px-8">
      <p className="reveal font-mono text-xs tracking-widest text-graphite uppercase">FAQ</p>
      <h2 id="faq-heading" className="reveal mt-4 font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
        Questions
      </h2>
      <div className="mt-10 space-y-3">
        {FAQS.map((f, i) => (
          <details key={f.q} className="faq glass glass-strong reveal group rounded-2xl open:border-dev/40">
            <summary className="flex cursor-pointer list-none items-center gap-5 px-6 py-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
              <span className="font-mono text-xs text-graphite tabular-nums">Q.{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1">{f.q}</span>
              <span
                aria-hidden
                className="grid size-7 shrink-0 place-items-center rounded-full border border-rule font-mono text-graphite transition-transform duration-300 group-open:rotate-45 group-open:border-dev group-open:text-dev"
              >
                +
              </span>
            </summary>
            <p className="max-w-3xl px-6 pb-6 pl-[4.5rem] leading-relaxed text-graphite">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
