import Stripe from "stripe";

import { db } from "./db";

export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export const appUrl = (): string => process.env.APP_URL ?? "http://localhost:3000";

/** Queues a paid run. Idempotent: the webhook and the success redirect may both call it. */
export async function markRunPaid(runId: string, sessionId: string): Promise<void> {
  await db()`
    update runs set status = 'queued'
    where id = ${runId} and stripe_session_id = ${sessionId} and status = 'pending_payment'`;
}

/** Fallback to the webhook: confirm the Checkout session when the customer lands back on the run page. */
export async function confirmCheckout(runId: string, sessionId: string): Promise<void> {
  if (!stripe) return;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status === "paid" && session.metadata?.run_id === runId) {
    await markRunPaid(runId, session.id);
  }
}
