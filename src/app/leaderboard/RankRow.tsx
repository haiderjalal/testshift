import type { LeaderboardEntry } from "@/lib/leaderboard";

import { bugLabel, scoreColor } from "./score";

export function RankRow({ entry: e, delay }: { entry: LeaderboardEntry; delay: number }) {
  const color = scoreColor(e.score);
  return (
    <li className="rank-row" style={{ ["--d" as string]: Math.min(delay, 12) }}>
      <div className="glass group grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 rounded-2xl px-4 py-4 transition hover:-translate-y-0.5 hover:border-ink/20 sm:grid-cols-[3rem_1fr_12rem_5rem] sm:px-6">
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
        </div>
        <div className="hidden sm:block" aria-hidden>
          <div className="h-1.5 overflow-hidden rounded-full bg-rule">
            <div className="score-bar h-full rounded-full" style={{ width: `${e.score}%`, background: color }} />
          </div>
          <p className={`mt-1.5 text-xs ${e.bugs ? "text-marker" : "text-pass"}`}>{bugLabel(e.bugs)}</p>
        </div>
        <p className="text-right">
          <span className="count-up font-display text-2xl font-semibold" style={{ ["--to" as string]: e.score, color }} aria-hidden />
          <span className="sr-only">
            Score {e.score} out of 100, {bugLabel(e.bugs)}
          </span>
          <span className="block text-xs text-graphite sm:hidden">{bugLabel(e.bugs)}</span>
        </p>
      </div>
    </li>
  );
}
