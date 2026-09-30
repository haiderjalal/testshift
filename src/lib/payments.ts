import Stripe from "stripe";

import { db } from "./db";
import { errorMessage, log } from "./log";

export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export const appUrl = (): string => process.env.APP_URL ?? "http://localhost:3000";

/**
 * Queues a paid run. Idempotent: the webhook and the success redirect may both call it. Callers only pass
 * sessions Stripe has confirmed as paid for this run (signed webhook or a server-side retrieve), so the
 * session id is also recorded here in case saving it right after Checkout creation failed.
 */
export async function markRunPaid(runId: string, sessionId: string): Promise<void> {
  await db()`
    update runs set status = 'queued', stripe_session_id = ${sessionId}
    where id = ${runId} and status = 'pending_payment'
      and (stripe_session_id is null or stripe_session_id = ${sessionId})`;
}

/**
 * Fallback to the webhook: confirm the Checkout session when the customer lands back on the run page.
 * Only the session this run created is checked, and Stripe errors never break the page.
 */
export async function confirmCheckout(runId: string, sessionId: string, expectedSessionId: string | null): Promise<void> {
  if (!stripe || !expectedSessionId || sessionId !== expectedSessionId) return;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === "paid" && session.metadata?.run_id === runId) await markRunPaid(runId, session.id);
  } catch (e) {
    log("warn", "Could not confirm Checkout session; the webhook will queue the run", { runId, error: errorMessage(e) });
  }
}
