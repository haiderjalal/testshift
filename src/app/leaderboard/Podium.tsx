import type { LeaderboardEntry } from "@/lib/leaderboard";

import { bugLabel, scoreColor } from "./score";

// Each place gets an agent hue; first place gets the rotating four-agent border.
const PLACE = {
  1: { color: "var(--color-pass)", height: "sm:min-h-[22rem]", order: "sm:order-2", label: "1st" },
  2: { color: "var(--color-dev)", height: "sm:min-h-[19rem]", order: "sm:order-1", label: "2nd" },
  3: { color: "var(--color-staging)", height: "sm:min-h-[17rem]", order: "sm:order-3", label: "3rd" },
} as const;

export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <section aria-labelledby="podium-heading" className="mt-14">
      <h2 id="podium-heading" className="sr-only">
        Top three
      </h2>
      <ol className="grid items-end gap-4 sm:grid-cols-3">
        {entries.map((e) => {
          const place = PLACE[e.rank as 1 | 2 | 3];
          return (
            <li
              key={e.host}
              className={`podium-rise ${place.order} ${e.rank === 1 ? "glow-card" : ""}`}
              style={{ ["--d" as string]: e.rank === 1 ? 2 : e.rank === 2 ? 0 : 1, ["--place" as string]: place.color }}
            >
              <div className={`glass podium-card relative flex h-full flex-col items-center overflow-hidden rounded-3xl p-6 text-center ${place.height}`}>
                <span aria-hidden className="podium-beam" />
                <span
                  className="float grid size-14 place-items-center rounded-full border-2 font-display text-lg font-semibold"
                  style={{ borderColor: place.color, color: place.color, boxShadow: `0 0 40px -6px ${place.color}` }}
                >
                  <span className="sr-only">Rank </span>
                  {e.rank}
                </span>
                <p className="mt-2 font-mono text-[11px] tracking-widest text-graphite uppercase" aria-hidden>
                  {place.label} place
                </p>
                <p className="mt-4 w-full truncate font-display text-xl font-semibold" title={e.name}>
                  {e.name}
                </p>
                <a
                  href={e.origin}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-1 w-full truncate font-mono text-xs text-graphite transition hover:text-dev"
                >
                  {e.host}
                </a>
                <p
                  className="count-up mt-auto pt-6 font-display text-6xl font-semibold tracking-tight"
                  style={{ ["--to" as string]: e.score, color: scoreColor(e.score) }}
                  aria-hidden
                />
                <p className="mt-1 text-sm text-graphite">
                  <span className="sr-only">Score {e.score} out of 100, </span>
                  <span aria-hidden>score · </span>
                  <span className={e.bugs ? "text-marker" : "text-pass"}>{bugLabel(e.bugs)}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
