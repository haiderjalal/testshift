import { errorMessage, log } from "@/lib/log";
import { markRunPaid, stripe } from "@/lib/payments";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!stripe || !secret || !signature) {
    return Response.json({ success: false, message: "Webhook not configured." }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch (e) {
    log("warn", "Rejected Stripe webhook", { error: errorMessage(e) });
    return Response.json({ success: false, message: "Invalid signature." }, { status: 400 });
  }

  // Card payments complete immediately; bank debits and similar methods succeed later.
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const runId = session.metadata?.run_id;
    if (runId && session.payment_status === "paid") await markRunPaid(runId, session.id);
  }
  return Response.json({ success: true });
}
