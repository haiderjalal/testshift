import assert from "node:assert/strict";
import { test } from "node:test";

import { rankEntries } from "../src/lib/leaderboard";

const entry = (host: string, score: number, bugs: number, critical = 0, day = 1) => ({
  name: host, host, origin: `https://${host}`, score, bugs, critical, testedAt: new Date(2026, 9, day),
});

test("leaderboard ranks by score, then fewer bugs, fewer critical bugs, earliest result", () => {
  const ranked = rankEntries([
    entry("low.com", 40, 9),
    entry("tie-late.com", 90, 2, 0, 5),
    entry("tie-critical.com", 90, 2, 1),
    entry("top.com", 98, 1),
    entry("tie-early.com", 90, 2, 0, 2),
    entry("tie-morebugs.com", 90, 3),
  ]);
  assert.deepEqual(ranked.map((e) => e.host), ["top.com", "tie-early.com", "tie-late.com", "tie-critical.com", "tie-morebugs.com", "low.com"]);
  assert.deepEqual(ranked.map((e) => e.rank), [1, 2, 3, 4, 5, 6]);
});
