import { UrlForm } from "@/components/UrlForm";
import { TRIAL_MINUTES } from "@/lib/plans";

/** Closing call to action: the same URL entry as the hero, on a slowly turning four-agent glow. */
export function FinalCta() {
  return (
    <section data-stage="prod" aria-labelledby="cta-heading" className="px-5 pb-24 sm:px-8">
      <div className="glass reveal relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-20 sm:px-14">
        <div aria-hidden className="lab-grid pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="orb pointer-events-none absolute -top-40 -right-20 size-[32rem] rounded-full opacity-40 blur-3xl"
          style={{ background: "conic-gradient(var(--color-dev), var(--color-staging), var(--color-uat), var(--color-prod), var(--color-dev))" }}
        />
        <h2 id="cta-heading" className="relative max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-6xl">
          Put four agents on your next release.
        </h2>
        <p className="relative mt-5 max-w-xl text-lg text-graphite">
          Paste a link and watch the pipeline run. The first {TRIAL_MINUTES} minutes are on us.
        </p>
        <UrlForm id="cta-url" className="relative mt-9" />
      </div>
    </section>
  );
}
