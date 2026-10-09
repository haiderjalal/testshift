import { db, type Strategy } from "./db";
import { assessResults, type ScoredCase } from "./qa";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  host: string;
  origin: string;
  score: number;
  bugs: number;
  critical: number;
  testedAt: Date;
}

type Unranked = Omit<LeaderboardEntry, "rank">;

const MAX_ENTRIES = 100;

/** Highest score first; ties go to fewer bugs, then fewer critical bugs, then whoever reached it first. */
export function rankEntries(entries: Unranked[]): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => b.score - a.score || a.bugs - b.bugs || a.critical - b.critical || a.testedAt.getTime() - b.testedAt.getTime())
    .slice(0, MAX_ENTRIES)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

/**
 * Each opted-in site's latest completed shift, scored exactly like its report.
 * Only the name, address and totals are public: bug details stay on the private report.
 */
export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  // Pick each site's latest completed shift FIRST, then keep it only if that latest shift opted in. Filtering
  // before the "latest" pick would keep a site listed from an old opted-in run after a newer run opted out.
  const runs = await db()<{ id: string; url: string; company_name: string | null; strategy: Strategy | null; completed_at: Date }[]>`
    select id, url, company_name, strategy, completed_at from (
      select distinct on (leaderboard_site) id, url, company_name, strategy, completed_at, leaderboard_opt_in
      from runs
      where status = 'completed' and leaderboard_site is not null
      order by leaderboard_site, completed_at desc
    ) latest
    where leaderboard_opt_in`;
  if (!runs.length) return [];

  const cases = await db()<(ScoredCase & { run_id: string })[]>`
    select run_id, agent, feature, status, priority, severity
    from test_cases where run_id = any(${runs.map((r) => r.id)}::uuid[])`;

  const entries: Unranked[] = [];
  for (const run of runs) {
    const own = cases.filter((c) => c.run_id === run.id);
    const { score } = assessResults(own, run.strategy);
    // A shift without completed checks has no score to compete with.
    if (score === null) continue;
    const bugs = own.filter((c) => c.status === "failed");
    const url = new URL(run.url);
    entries.push({
      name: run.company_name ?? url.hostname,
      host: url.hostname,
      origin: url.origin,
      score,
      bugs: bugs.length,
      critical: bugs.filter((c) => c.severity === "critical").length,
      testedAt: run.completed_at,
    });
  }
  return rankEntries(entries);
}
