import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { loadLeaderboard } from "../src/lib/leaderboard";

const database = new PGlite(); let socket: PGLiteSocketServer; let sql: postgres.Sql;
before(async () => {
  for (const file of (await readdir("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort()) await database.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  socket = new PGLiteSocketServer({ db: database, port: 0, host: "127.0.0.1" }); await socket.start();
  sql = postgres(`postgres://postgres:postgres@${socket.getServerConn()}/postgres`, { prepare: false, max: 1 }); Object.assign(globalThis, { sql });
});
after(async () => { await sql?.end(); await socket?.stop(); await database.close(); });

interface RunFixture { site: string; status: "completed" | "running"; optIn: boolean; completedAt: Date | null; company?: string }
interface CaseFixture { status: "passed" | "failed" | "pending"; priority: "high" | "medium" | "low"; severity?: "critical" | "major" | "minor" }

const day = (number: number) => new Date(Date.UTC(2026, 9, number));

async function insertRun({ site, status, optIn, completedAt, company }: RunFixture): Promise<string> {
  const [run] = await sql`insert into runs (url,email,plan,minutes,status,completed_at,leaderboard_opt_in,leaderboard_site,company_name)
    values (${`https://${site}`}, 'owner@example.test', 'senior', 60, ${status}, ${completedAt}, ${optIn}, ${site}, ${company ?? null}) returning id`;
  return run.id;
}

async function addCases(runId: string, cases: CaseFixture[]): Promise<void> {
  for (const [index, item] of cases.entries()) {
    await sql`insert into test_cases (run_id,seq,title,category,priority,start_url,steps,expected,status,severity,agent,feature)
      values (${runId}, ${index + 1}, ${`Check ${index + 1}`}, 'functional', ${item.priority}, 'https://example.test/', '[]', 'Works',
        ${item.status}, ${item.severity ?? null}, 'uat', 'checkout')`;
  }
}

test("the leaderboard ranks each site by its newest completed shift, and drops a site whose newest shift opted out", async () => {
  // a.test: the older opted-in shift is superseded by a newer shift that opted out, so the site is not listed.
  await addCases(await insertRun({ site: "a.test", status: "completed", optIn: true, completedAt: day(1) }), [{ status: "passed", priority: "high" }]);
  await addCases(await insertRun({ site: "a.test", status: "completed", optIn: false, completedAt: day(2) }), [{ status: "passed", priority: "high" }]);

  // b.test: the passed high case scores 3 of 5 points, the failed medium case adds a major bug.
  await addCases(await insertRun({ site: "b.test", status: "completed", optIn: true, completedAt: day(3), company: "Bee Labs" }), [
    { status: "passed", priority: "high" },
    { status: "failed", priority: "medium", severity: "major" },
  ]);

  // c.test: nothing has been evaluated yet, so there is no score to rank.
  await addCases(await insertRun({ site: "c.test", status: "completed", optIn: true, completedAt: day(4) }), [{ status: "pending", priority: "high" }]);

  // d.test: a newer shift still running is ignored; the completed shift decides. Passing 1 of 4 points scores 25.
  await addCases(await insertRun({ site: "d.test", status: "completed", optIn: true, completedAt: day(1) }), [
    { status: "failed", priority: "high", severity: "critical" },
    { status: "passed", priority: "low" },
  ]);
  await insertRun({ site: "d.test", status: "running", optIn: true, completedAt: null });

  // e.test: never opted in.
  await addCases(await insertRun({ site: "e.test", status: "completed", optIn: false, completedAt: day(2) }), [{ status: "passed", priority: "high" }]);

  const board = await loadLeaderboard();
  assert.deepEqual(board.map((entry) => ({ rank: entry.rank, name: entry.name, score: entry.score, bugs: entry.bugs, critical: entry.critical })), [
    { rank: 1, name: "Bee Labs", score: 60, bugs: 1, critical: 0 },
    { rank: 2, name: "d.test", score: 25, bugs: 1, critical: 1 },
  ]);
});
