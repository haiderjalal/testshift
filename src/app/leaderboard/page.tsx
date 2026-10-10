import type { Metadata } from "next";
import Link from "next/link";

import { PageIntro } from "@/components/PageIntro";
import { SiteHeader } from "@/components/SiteHeader";
import { SplitText } from "@/components/SplitText";
import { loadLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard";

import { EmptyBoard } from "./EmptyBoard";
import { Podium } from "./Podium";
import { RankRow } from "./RankRow";

// Scores change whenever a shift completes; read them per request, never at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "QA Leaderboard",
  description: "Websites and products ranked by their latest TestShift QA score. Fewer bugs, higher rank.",
  alternates: { canonical: "/leaderboard" },
  openGraph: { title: "TestShift QA Leaderboard", description: "Fewer bugs, higher rank. See who ships the cleanest product." },
};

export default async function LeaderboardPage() {
  const entries: LeaderboardEntry[] = await loadLeaderboard();
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <>
      <SiteHeader />
      <main className="relative mx-auto w-full max-w-5xl flex-1 px-5 pt-12 pb-24 sm:px-8">
        <div aria-hidden className="lab-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem]" />
        <PageIntro
          eyebrow="Live rankings"
          title={
            <>
              <SplitText text="Fewest bugs" /> <SplitText text="wins." color="var(--color-pass)" offset={12} />
            </>
          }
          description="Every site is ranked by the score of its latest QA shift. Fix your bugs, book a retest and climb."
        />

        {entries.length === 0 ? (
          <EmptyBoard />
        ) : (
          <>
            <Podium entries={podium} />
            {rest.length > 0 && (
              <section aria-labelledby="ranks-heading" className="mt-16">
                <h2 id="ranks-heading" className="sr-only">
                  Remaining ranks
                </h2>
                <ol className="space-y-3">
                  {rest.map((e, i) => (
                    <RankRow key={e.host} entry={e} delay={i} />
                  ))}
                </ol>
              </section>
            )}
            <div className="glass reveal mt-16 flex flex-col items-start justify-between gap-5 rounded-3xl p-8 sm:flex-row sm:items-center">
              <div>
                <p className="font-display text-xl font-semibold">Not on the podium yet?</p>
                <p className="mt-1 text-graphite">Your latest shift sets your rank. Fix what we found and retest.</p>
              </div>
              <Link href="/hire" className="btn-primary h-11 shrink-0">
                Book a retest
              </Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
