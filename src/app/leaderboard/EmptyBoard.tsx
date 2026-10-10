import Link from "next/link";
import type { ReactElement } from "react";

import { PLACE } from "./Podium";

// Shown in podium order (2nd, 1st, 3rd) so the empty slots line up with where the first sites will land.
const SLOT_RANKS = [2, 1, 3] as const;

/** Shown while no site has opted in: dashed podium slots mark the places still open. */
export function EmptyBoard(): ReactElement {
  return (
    <div className="rise mt-14" style={{ ["--d" as string]: 5 }}>
      <div aria-hidden className="grid items-end gap-4 sm:grid-cols-3">
        {SLOT_RANKS.map((rank) => (
          <div
            key={rank}
            className={`hidden flex-col items-center justify-center rounded-3xl border border-dashed border-rule sm:flex ${PLACE[rank].height} ${PLACE[rank].order}`}
          >
            <span className="grid size-12 place-items-center rounded-full border border-dashed border-rule font-display text-base text-graphite">
              {rank}
            </span>
          </div>
        ))}
      </div>
      <div className="glass glass-strong mt-4 rounded-3xl p-8 text-center sm:p-10">
        <p className="font-display text-xl font-semibold">The board is empty. The first spot is yours.</p>
        <p className="mt-2 text-graphite">Book a shift and tick &ldquo;List my site on the public leaderboard&rdquo;.</p>
        <Link href="/hire" className="btn-primary mt-6 h-11">
          Test my site
        </Link>
      </div>
    </div>
  );
}
