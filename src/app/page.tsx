import Link from "next/link";

import { Logo } from "@/components/Logo";
import { SiteHeader } from "@/components/SiteHeader";
import { loadLandingPrices } from "@/lib/beta-orders";
import { SITE } from "@/lib/plans";

export const dynamic = "force-dynamic";

import { Consoles } from "./_landing/Consoles";
import { Coverage } from "./_landing/Coverage";
import { Deliverables } from "./_landing/Deliverables";
import { Faq } from "./_landing/Faq";
import { FinalCta } from "./_landing/FinalCta";
import { Hero } from "./_landing/Hero";
import { Pipeline } from "./_landing/Pipeline";
import { Pricing } from "./_landing/Pricing";
import { Ticker } from "./_landing/Ticker";

export default async function Home() {
  const { prices, unavailable } = await loadLandingPrices();
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Ticker />
        <Pipeline />
        <Coverage />

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

        <Deliverables />

        <Pricing prices={prices} unavailable={unavailable} />

        <Faq />

        <FinalCta />
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
