import type { ReactElement } from "react";

import type { LeaderboardEntry } from "@/lib/leaderboard";

import { bugLabel, scoreColor } from "./score";

// One bar layout at every width: the bar sits under the site name, so phones keep the score visual too.
export function RankRow({ entry: e, delay }: { entry: LeaderboardEntry; delay: number }): ReactElement {
  const color = scoreColor(e.score);
  return (
    <li className="rank-row" style={{ ["--d" as string]: Math.min(delay, 12) }}>
      <div className="glass group grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-3 rounded-2xl px-4 py-4 transition hover:-translate-y-0.5 hover:border-ink/20 sm:grid-cols-[3rem_minmax(0,1fr)_7rem] sm:gap-x-6 sm:px-6">
        <span className="font-mono text-lg text-graphite">
          <span className="sr-only">Rank </span>
          {e.rank}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium" title={e.name}>
            {e.name}
          </p>
          <a
            href={e.origin}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="block truncate font-mono text-xs text-graphite transition hover:text-dev"
          >
            {e.host}
          </a>
          <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-rule">
            <div className="score-bar h-full rounded-full" style={{ width: `${e.score}%`, background: color }} />
          </div>
        </div>
        <p className="text-right">
          <span className="count-up block font-display text-2xl font-semibold" style={{ ["--to" as string]: e.score, color }} aria-hidden />
          <span className="sr-only">
            Score {e.score} out of 100, {bugLabel(e.bugs)}
          </span>
          <span className={`block text-xs ${e.bugs ? "text-marker" : "text-pass"}`} aria-hidden>
            {bugLabel(e.bugs)}
          </span>
        </p>
      </div>
    </li>
  );
}
