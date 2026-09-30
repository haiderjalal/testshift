"use server";

import { redirect } from "next/navigation";

import postgres from "postgres";
import { z } from "zod";

import { db } from "@/lib/db";
import { errorMessage, log } from "@/lib/log";
import { emailKey, isPublicHost, siteKey } from "@/lib/net";
import { appUrl, stripe } from "@/lib/payments";
import { HOUR_OPTIONS, PLANS, TRIAL_MINUTES, type PlanId } from "@/lib/plans";
import { allow, clientKey } from "@/lib/rateLimit";

// Abuse limits. Trials cost real Claude tokens, so they are capped per visitor and per day overall.
const TRIALS_PER_IP_PER_DAY = 2;
const BOOKINGS_PER_IP_PER_HOUR = 20;
const MAX_TRIALS_PER_DAY = Number(process.env.MAX_TRIALS_PER_DAY ?? 100);
const BUSY_MESSAGE = "Too many bookings from your network right now. Please try again later.";

export interface BookingState {
  message?: string;
  errors?: Partial<Record<"url" | "email" | "plan" | "hours" | "notes" | "consent", string>>;
}

const bookingSchema = z.object({
  url: z
    .url({ protocol: /^https?$/i, error: "Enter the full link, like https://your-site.com" })
    .max(2000, { error: "That link is too long." }),
  email: z.email({ error: "Enter an email address so we can send your report." }).max(254),
  plan: z.enum(Object.keys(PLANS) as [PlanId, ...PlanId[]], { error: "Choose a plan." }),
  // "trial" is the free first shift; otherwise a number of paid hours.
  hours: z.enum(["trial", ...HOUR_OPTIONS.map(String)], { error: "Choose how long the shift should be." }),
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

  const { email, plan, hours, notes } = parsed.data;
  const trial = hours === "trial";
  // Store the normalised form: lowercase scheme and host, no trailing dot, percent-encoded characters.
  const target = new URL(parsed.data.url);
  if (target.username || target.password) {
    return { errors: { url: "Remove the username or password from the link." } };
  }
  target.hostname = target.hostname.replace(/\.$/, "");
  const url = target.href;
  if (!(await isPublicHost(target.hostname))) {
    return { errors: { url: "We can only test websites that are publicly reachable on the internet." } };
  }

  let destination: string;
  try {
    const visitor = await clientKey();
    if (!(await allow(`book:${visitor}`, BOOKINGS_PER_IP_PER_HOUR, 3_600))) return { message: BUSY_MESSAGE };
    if (trial) {
      // Counted from trials actually created, so a refused attempt doesn't use up a visitor's allowance.
      const [{ today, fromVisitor }] = await db()<{ today: number; fromVisitor: number }[]>`
        select count(*)::int as today, count(*) filter (where trial_ip = ${visitor})::int as "fromVisitor"
        from runs where is_trial and created_at > now() - interval '1 day'`;
      if (fromVisitor >= TRIALS_PER_IP_PER_DAY) {
        return { errors: { hours: "Your network has already used its free trials today. Pick hours to book a paid shift." } };
      }
      if (today >= MAX_TRIALS_PER_DAY) {
        log("warn", "Daily free-trial cap reached", { cap: MAX_TRIALS_PER_DAY });
        return { errors: { hours: "Free trials are fully booked for today. Pick hours to book a paid shift, or try tomorrow." } };
      }
    }
    const booking = { url, email, plan, notes };
    destination = trial ? await createTrial({ ...booking, visitor }) : await createBooking({ ...booking, hours: Number(hours) });
  } catch (e) {
    if (e instanceof postgres.PostgresError && e.code === "23505" && trial) {
      return {
        errors: {
          hours: "The free trial has already been used for this email or website. Pick hours to book a paid shift.",
        },
      };
    }
    log("error", "Booking failed", { error: errorMessage(e) });
    return { message: "We couldn't start your booking. Please try again in a minute." };
  }
  redirect(destination);
}

interface Booking {
  url: string;
  email: string;
  plan: PlanId;
  notes: string;
}

/**
 * Free first shift: no payment, queued immediately. Unique indexes on the normalised mailbox and the
 * registrable domain allow one per person and one per website, even under parallel requests.
 */
async function createTrial(b: Booking & { visitor: string }): Promise<string> {
  const [run] = await db()<{ id: string }[]>`
    insert into runs (url, email, plan, minutes, is_trial, notes, status, trial_email, trial_site, trial_ip)
    values (${b.url}, ${b.email}, ${b.plan}, ${TRIAL_MINUTES}, true, ${b.notes}, 'queued',
      ${emailKey(b.email)}, ${siteKey(new URL(b.url).hostname)}, ${b.visitor})
    returning id`;
  return `/runs/${run.id}`;
}

async function createBooking(b: Booking & { hours: number }): Promise<string> {
  if (!stripe && process.env.NODE_ENV === "production") throw new Error("STRIPE_SECRET_KEY is not set");

  const [run] = await db()<{ id: string }[]>`
    insert into runs (url, email, plan, minutes, notes, status)
    values (${b.url}, ${b.email}, ${b.plan}, ${b.hours * 60}, ${b.notes}, ${stripe ? "pending_payment" : "queued"})
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
