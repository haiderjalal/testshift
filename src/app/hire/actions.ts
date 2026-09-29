"use server";

import { redirect } from "next/navigation";

import { z } from "zod";

import { db } from "@/lib/db";
import { errorMessage, log } from "@/lib/log";
import { isPublicHost } from "@/lib/net";
import { appUrl, stripe } from "@/lib/payments";
import { HOUR_OPTIONS, PLANS, type PlanId } from "@/lib/plans";

export interface BookingState {
  message?: string;
  errors?: Partial<Record<"url" | "email" | "plan" | "hours" | "notes" | "consent", string>>;
}

const bookingSchema = z.object({
  url: z.url({ protocol: /^https?$/, error: "Enter the full link, like https://your-site.com" }),
  email: z.email({ error: "Enter an email address so we can send your report." }),
  plan: z.enum(Object.keys(PLANS) as [PlanId, ...PlanId[]], { error: "Choose a plan." }),
  hours: z.coerce
    .number()
    .refine((h) => (HOUR_OPTIONS as readonly number[]).includes(h), { error: "Choose how many hours to book." }),
  notes: z.string().max(2000, { error: "Keep notes under 2,000 characters." }),
  consent: z.literal("on", { error: "Confirm you're allowed to test this site." }),
});

export async function bookShift(_prev: BookingState, formData: FormData): Promise<BookingState> {
  const raw = {
    url: String(formData.get("url") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    plan: formData.get("plan"),
    hours: formData.get("hours"),
    notes: String(formData.get("notes") ?? "").trim(),
    consent: formData.get("consent"),
  };
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = Object.fromEntries(
      parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
    ) as BookingState["errors"];
    return { errors };
  }

  const { url, email, plan, hours, notes } = parsed.data;
  if (!(await isPublicHost(new URL(url).hostname))) {
    return { errors: { url: "We can only test websites that are publicly reachable on the internet." } };
  }

  let destination: string;
  try {
    destination = await createBooking({ url, email, plan, hours, notes });
  } catch (e) {
    log("error", "Booking failed", { error: errorMessage(e) });
    return { message: "We couldn't start your booking. Please try again in a minute." };
  }
  redirect(destination);
}

async function createBooking(b: { url: string; email: string; plan: PlanId; hours: number; notes: string }) {
  if (!stripe && process.env.NODE_ENV === "production") throw new Error("STRIPE_SECRET_KEY is not set");

  const [run] = await db()<{ id: string }[]>`
    insert into runs (url, email, plan, hours, notes, status)
    values (${b.url}, ${b.email}, ${b.plan}, ${b.hours}, ${b.notes}, ${stripe ? "pending_payment" : "queued"})
    returning id`;

  // Local development without Stripe keys: skip payment and queue the shift straight away.
  if (!stripe) return `/runs/${run.id}`;

  const plan = PLANS[b.plan];
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: b.email,
    line_items: [
      {
        quantity: b.hours,
        price_data: {
          currency: "usd",
          unit_amount: plan.rate * 100,
          product_data: { name: `${plan.name} shift (per hour)`, description: new URL(b.url).hostname },
        },
      },
    ],
    metadata: { run_id: run.id },
    success_url: `${appUrl()}/runs/${run.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/hire?plan=${b.plan}`,
  });
  await db()`update runs set stripe_session_id = ${session.id} where id = ${run.id}`;
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}
