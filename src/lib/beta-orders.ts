// Server/worker data layer. No "use server": only authenticated action wrappers expose mutations.
import { db, isUuid } from "./db";
import { type BetaPrices, quoteFromCost } from "./beta-pricing";
import { PLANS, type PlanId } from "./plans";
import { errorMessage, log } from "./log";

export class OrderError extends Error {}

export async function loadBetaPrices(): Promise<BetaPrices> {
  const rows = await db()<{ plan: PlanId; estimated_token_hour_cents: number }[]>`select plan, estimated_token_hour_cents from beta_plan_prices`;
  return Object.fromEntries(rows.map((r) => [r.plan, quoteFromCost(r.estimated_token_hour_cents, 60).hourlyCents]));
}

/** Optional landing-page prices must not take down the public website. Orders
 * continue to use the strict loader and database snapshot before accepting a quote. */
export async function loadLandingPrices(): Promise<{ prices: BetaPrices; unavailable: boolean }> {
  try { return { prices: await loadBetaPrices(), unavailable: false }; }
  catch (error) {
    log("warn", "Landing pricing unavailable", { operation: "loadLandingPrices", error: errorMessage(error) });
    return { prices: {}, unavailable: true };
  }
}

export async function saveBetaPrice(plan: string, costCents: number): Promise<void> {
  if (!Object.hasOwn(PLANS, plan)) throw new OrderError("Unknown plan.");
  quoteFromCost(costCents, 60);
  await db()`insert into beta_plan_prices (plan, estimated_token_hour_cents) values (${plan}, ${costCents})
    on conflict (plan) do update set estimated_token_hour_cents = excluded.estimated_token_hour_cents, updated_at = now()`;
}

export async function createManualOrder(b: { url: string; email: string; plan: PlanId; hours: number; notes: string }, expectedHourlyCents: number | null): Promise<string> {
  return await db().begin(async (sql) => {
    // A shared row lock serializes this snapshot against an admin price update.
    const [price] = await sql<{ estimated_token_hour_cents: number }[]>`select estimated_token_hour_cents from beta_plan_prices where plan = ${b.plan} for share`;
    const quote = price ? quoteFromCost(price.estimated_token_hour_cents, b.hours * 60) : null;
    if ((quote?.hourlyCents ?? null) !== expectedHourlyCents) throw new OrderError("Pricing changed. Refresh this page to review the current quote before booking.");
    const [row] = await sql<{ id: string }[]>`insert into runs
      (url,email,plan,minutes,notes,status,payment_method,estimated_token_hour_cents,quoted_hourly_cents,quoted_total_cents,quoted_at)
      values (${b.url},${b.email},${b.plan},${b.hours * 60},${b.notes},'pending_payment','wise',
        ${price?.estimated_token_hour_cents ?? null},${quote?.hourlyCents ?? null},${quote?.totalCents ?? null},${quote ? new Date() : null}) returning id`;
    return row.id;
  }) as string;
}

export async function quoteManualOrder(id: string, costCents: number): Promise<void> {
  if (!isUuid(id)) throw new OrderError("Invalid order.");
  await db().begin(async (sql) => {
    const [r] = await sql`select minutes, quoted_total_cents from runs where id = ${id} and payment_method = 'wise' and status = 'pending_payment' for update`;
    if (!r) throw new OrderError("This order cannot be quoted.");
    if (r.quoted_total_cents !== null) throw new OrderError("This order already has a fixed quote; it cannot be repriced.");
    const quote = quoteFromCost(costCents, r.minutes);
    await sql`update runs set estimated_token_hour_cents = ${costCents}, quoted_hourly_cents = ${quote.hourlyCents},
      quoted_total_cents = ${quote.totalCents}, quoted_at = now() where id = ${id}`;
  });
}

export async function confirmManualPayment(id: string, amountCents: number, rawReference: string): Promise<void> {
  const reference = rawReference.trim();
  if (!isUuid(id) || reference.length < 3 || reference.length > 120 || /[\r\n\x00-\x1f]/.test(reference)) throw new OrderError("Provide a valid order and a 3–120 character Wise transaction reference.");
  await db().begin(async (sql) => {
    const [r] = await sql`select status, quoted_total_cents, payment_reference, amount_received_cents from runs
      where id = ${id} and payment_method = 'wise' for update`;
    if (!r || r.quoted_total_cents === null) throw new OrderError("Create a fixed quote before confirming payment.");
    if (!Number.isSafeInteger(amountCents) || amountCents !== r.quoted_total_cents) throw new OrderError("Received USD amount must match this order's fixed quote. Resolve partial payments or fees before confirming.");
    if (r.status !== 'pending_payment') {
      if (r.payment_reference === reference && r.amount_received_cents === amountCents) return; // harmless retry
      throw new OrderError("Payment has already been confirmed for this order.");
    }
    await sql`update runs set status = 'paid', payment_confirmed_at = now(), amount_received_cents = ${amountCents},
      payment_reference = ${reference} where id = ${id}`;
  });
}

export async function startManualOrder(id: string): Promise<void> {
  if (!isUuid(id)) throw new OrderError("Invalid order.");
  await db().begin(async (sql) => {
    const [r] = await sql`select status, payment_confirmed_at, start_authorized_at from runs where id = ${id} and payment_method = 'wise' for update`;
    if (!r?.payment_confirmed_at) throw new OrderError("Confirm the received payment before starting this shift.");
    if (r.start_authorized_at) return; // never reset the clock or enqueue a completed shift
    if (r.status !== 'paid') throw new OrderError("This order is not ready to start.");
    await sql`update runs set status = 'queued', start_authorized_at = now() where id = ${id}`;
  });
}
