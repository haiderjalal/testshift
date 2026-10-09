import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { LeaseLostError, withRunLease } from "../worker/lease";
import { confirmManualPayment, createManualOrder, loadBetaPrices, quoteManualOrder, saveBetaPrice, startManualOrder } from "../src/lib/beta-orders";
import { parseUsd, quoteFromCost } from "../src/lib/beta-pricing";
import { markRunPaid } from "../src/lib/payments";
import { loadDashboard } from "../src/app/admin/data";

const db = new PGlite();
let socket: PGLiteSocketServer;
let sql: postgres.Sql;
before(async () => {
  for (const file of (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  socket = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  await socket.start();
  sql = postgres(`postgres://postgres:postgres@${socket.getServerConn()}/postgres`, { prepare: false, max: 1 });
  Object.assign(globalThis, { sql });
});
after(async () => { await sql?.end(); await socket?.stop(); await db.close(); });

test("rate limiter admits exactly the allowance in a burst and bounds stored rows", async () => {
  const results = await Promise.all(Array.from({ length: 50 }, () => db.query<{ allowed: boolean }>("select consume_rate_limit('burst', 5, 60) as allowed")));
  assert.equal(results.filter((r) => r.rows[0].allowed).length, 5);
  const { rows } = await db.query<{ hits: number }>("select hits from rate_limit_windows where bucket = 'burst'");
  assert.equal(rows.length, 1); assert.equal(rows[0].hits, 6);
});
test("rate-limit windows expire and independent buckets remain usable", async () => {
  await db.exec("update rate_limit_windows set window_started_at = now() - interval '2 minutes' where bucket = 'burst'");
  const { rows } = await db.query<{ allowed: boolean }>("select consume_rate_limit('burst', 5, 60) as allowed");
  assert.equal(rows[0].allowed, true);
  assert.equal((await db.query<{ allowed: boolean }>("select consume_rate_limit('other', 1, 60) as allowed")).rows[0].allowed, true);
});
const createTrial = (n: number, visitor: string, cap = 100) => db.query("select create_trial($1,$2,'junior',20,'',$2,$3,$4,$5,2)",
  [`https://site${n}.example/`, `qa${n}@example.com`, `site${n}.example`, visitor, cap]);
test("trial caps count only committed bookings and enforce the visitor allowance", async () => {
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, n) => createTrial(n, "visitor-a")));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal(results.filter((r) => r.status === "rejected" && /trial_ip_limit/.test(String(r.reason))).length, 10);
});
test("global trial cap applies across different visitors", async () => {
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, n) => createTrial(n + 100, `visitor-${n}`, 5)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from runs where is_trial")).rows[0].count, 5);
});
test("duplicate trial rolls back without consuming allowance", async () => {
  await assert.rejects(createTrial(0, "visitor-new"), /duplicate key/);
  await createTrial(999, "visitor-new");
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from runs where trial_ip = 'visitor-new'")).rows[0].count, 1);
});
test("new migration is idempotent and preserves created runs", async () => {
  await db.exec(await readFile("supabase/migrations/20261006000000_qa_integrity.sql", "utf8"));
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from runs")).rows[0].count, 6);
});

test("only the current running worker lease can write, and failed writes roll back", async () => {
  const [{ id }] = await sql`select id from runs limit 1`;
  const current = "22222222-2222-4222-8222-222222222222";
  const stale = "33333333-3333-4333-8333-333333333333";
  await sql`update runs set status = 'running', claim_token = ${current} where id = ${id}`;
  await withRunLease(id, current, async (tx) => { await tx`update runs set notes = 'owned' where id = ${id}`; });
  await assert.rejects(withRunLease(id, stale, async (tx) => { await tx`update runs set notes = 'stale overwrite' where id = ${id}`; }), LeaseLostError);
  await assert.rejects(withRunLease(id, current, async (tx) => {
    await tx`update runs set notes = 'partial write' where id = ${id}`;
    throw new Error("Injected crash");
  }), /Injected crash/);
  assert.equal((await sql`select notes from runs where id = ${id}`)[0].notes, "owned");
  await sql`update runs set status = 'completed' where id = ${id}`;
  await assert.rejects(withRunLease(id, current, async () => undefined), LeaseLostError);
});

const order = { url: "https://8.8.8.8/", email: "beta@example.com", plan: "junior" as const, hours: 2, notes: "Test fixture" };
let betaId: string;

test("money parsing and 10x quotes use cents, rejecting invalid and fractional inputs", () => {
  assert.equal(parseUsd("1"), 100); assert.equal(parseUsd("1.01"), 101);
  assert.deepEqual(quoteFromCost(100, 120), { hourlyCents: 1000, totalCents: 2000 });
  for (const value of ["", "0", "-1", "NaN", "Infinity", "1e2", "0.001", "1.234", "01", "1,000"]) assert.throws(() => parseUsd(value));
  assert.throws(() => quoteFromCost(1.5, 60)); assert.throws(() => quoteFromCost(100, 90));
});

test("manual orders wait unquoted until an admin sets a fixed 10x quote", async () => {
  betaId = await createManualOrder(order, null);
  await assert.rejects(startManualOrder(betaId), /Confirm/);
  await assert.rejects(confirmManualPayment(betaId, 2000, "WISE-first"), /quote/);
  await quoteManualOrder(betaId, 100);
  const [r] = await sql`select * from runs where id = ${betaId}`;
  assert.equal(r.status, "pending_payment"); assert.equal(r.quoted_hourly_cents, 1000); assert.equal(r.quoted_total_cents, 2000);
  assert.equal(r.started_at, null); assert.equal(r.deadline_at, null);
  await assert.rejects(quoteManualOrder(betaId, 200), /cannot be repriced/);
});

test("published rates snapshot new orders and stale/tampered quotes cannot silently charge", async () => {
  await saveBetaPrice("junior", 100);
  assert.equal((await loadBetaPrices()).junior, 1000);
  const id = await createManualOrder(order, 1000);
  await saveBetaPrice("junior", 200);
  assert.equal((await sql`select quoted_total_cents from runs where id = ${id}`)[0].quoted_total_cents, 2000);
  await assert.rejects(createManualOrder(order, 1000), /Pricing changed/);
  await assert.rejects(createManualOrder(order, 1), /Pricing changed/);
  await assert.rejects(createManualOrder(order, null), /Pricing changed/);
  await assert.rejects(saveBetaPrice("constructor", 100), /Unknown/);
});

test("payment confirmation requires exact quote and does not enqueue or start time", async () => {
  await assert.rejects(confirmManualPayment(betaId, 1000, "WISE-first"), /must match/);
  await assert.rejects(confirmManualPayment(betaId, 2001, "WISE-first"), /must match/);
  await confirmManualPayment(betaId, 2000, "WISE-first");
  await confirmManualPayment(betaId, 2000, "WISE-first");
  const [r] = await sql`select * from runs where id = ${betaId}`;
  assert.equal(r.status, "paid"); assert.equal(r.amount_received_cents, 2000);
  assert.ok(r.payment_confirmed_at); assert.equal(r.start_authorized_at, null);
  assert.equal(r.started_at, null); assert.equal(r.deadline_at, null);
  await assert.rejects(confirmManualPayment(betaId, 2000, "OTHER-reference"), /already/);
});

test("parallel/manual start retries cannot reset time or restart completed work", async () => {
  await Promise.all([startManualOrder(betaId), startManualOrder(betaId)]);
  const [before] = await sql`select * from runs where id = ${betaId}`;
  assert.equal(before.status, "queued"); assert.ok(before.start_authorized_at); assert.equal(before.started_at, null);
  await sql`update runs set status = 'completed', started_at = now() - interval '2 hours', deadline_at = now(), completed_at = now() where id = ${betaId}`;
  await startManualOrder(betaId);
  const [after] = await sql`select * from runs where id = ${betaId}`;
  assert.equal(after.status, "completed"); assert.deepEqual(after.start_authorized_at, before.start_authorized_at);
});

test("receipt reuse and direct unpaid enqueue fail closed", async () => {
  const id = await createManualOrder(order, 2000);
  await assert.rejects(confirmManualPayment(id, 4000, "wise-FIRST"), /duplicate key/);
  await assert.rejects(sql`update runs set status = 'queued' where id = ${id}`, /runs_beta_payment_check/);
  assert.equal((await sql`select status from runs where id = ${id}`)[0].status, "pending_payment");
  const previous = process.env.STRIPE_ENABLED;
  try { process.env.STRIPE_ENABLED = "1"; await markRunPaid(id, "cs_ignored_manual_order"); }
  finally { if (previous === undefined) delete process.env.STRIPE_ENABLED; else process.env.STRIPE_ENABLED = previous; }
  assert.equal((await sql`select status from runs where id = ${id}`)[0].status, "pending_payment");
});

test("dashboard counts confirmed receipts, not unpaid bookings or today's price", async () => {
  // A direct data-loader call outside an authenticated Next request must now fail closed.
  await assert.rejects(loadDashboard("all"));
  const [data] = await sql`select coalesce(sum(amount_received_cents),0)::float8 / 100 as revenue
    from runs where not is_trial and payment_confirmed_at is not null`;
  assert.equal(data.revenue, 20);
  const [run] = await sql`select amount_received_cents::float8 / 100 as revenue from runs where id = ${betaId}`;
  assert.equal(run.revenue, 20);
});

test("manual order migration can be reapplied without resetting quotes or payment state", async () => {
  await db.exec(await readFile("supabase/migrations/20261007000000_manual_beta_orders.sql", "utf8"));
  const [r] = await sql`select status, quoted_total_cents, amount_received_cents from runs where id = ${betaId}`;
  assert.equal(r.status, "completed"); assert.equal(r.quoted_total_cents, 2000); assert.equal(r.amount_received_cents, 2000);
});
