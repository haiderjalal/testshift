import { randomUUID } from "node:crypto";
import { log } from "@/lib/log";
import { markRunPaid, stripe } from "@/lib/payments";
import { isUuid } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { readBoundedBody, RequestError, sameOrigin, WEBHOOK_BODY_LIMIT } from "@/lib/security";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const reply = (status: number, success = false) => Response.json(
    { success, ...(success ? {} : { message: "Request could not be processed." }), requestId },
    { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
  );
  if (request.headers.has("origin") && !sameOrigin(request.headers.get("origin"), appUrl())) return reply(403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply(415);
  let body: string;
  try { body = await readBoundedBody(request, WEBHOOK_BODY_LIMIT); }
  catch (error) { log("warn", "Webhook body rejected", { requestId }); return reply(error instanceof RequestError ? error.status : 400); }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!stripe || !secret || !signature || signature.length > 4096) return reply(400);

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    log("warn", "Rejected Stripe webhook", { requestId });
    return reply(400);
  }

  // Card payments complete immediately; bank debits and similar methods succeed later.
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      const runId = session.metadata?.run_id;
      if (runId && isUuid(runId) && session.payment_status === "paid") await markRunPaid(runId, session.id);
    }
    log("info", "Webhook accepted", { requestId });
    return reply(200, true);
  } catch {
    log("error", "Webhook delivery failed", { requestId });
    return reply(503);
  }
}
