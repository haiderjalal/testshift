"use server";

import { redirect } from "next/navigation";

import postgres from "postgres";
import { z } from "zod";

import { db } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { errorMessage, log } from "@/lib/log";
import { emailKey, isPublicHost, siteKey } from "@/lib/net";
import { createManualOrder, OrderError } from "@/lib/beta-orders";
import { HOUR_OPTIONS, PLANS, TRIAL_MINUTES, type PlanId } from "@/lib/plans";
import { allow, clientKey } from "@/lib/rateLimit";

// Abuse limits. Trials cost real Claude tokens, so they are capped per visitor and per day overall.
const TRIALS_PER_IP_PER_DAY = 2;
const BOOKINGS_PER_IP_PER_HOUR = 20;
const MAX_TRIALS_PER_DAY = Number(process.env.MAX_TRIALS_PER_DAY ?? 100);
const BUSY_MESSAGE = "Too many bookings from your network right now. Please try again later.";

export interface BookingState {
  message?: string;
  errors?: Partial<Record<"url" | "email" | "company" | "plan" | "hours" | "notes" | "consent", string>>;
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
  // Shown publicly on the leaderboard, so no control characters or line breaks.
  company: z.string().max(80, { error: "Keep the name under 80 characters." })
    .regex(/^[^\p{Cc}]*$/u, { error: "Use letters, numbers and punctuation only." }),
  leaderboard: z.literal("on").optional(),
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
    company: String(formData.get("company") ?? "").trim(),
    leaderboard: formData.get("leaderboard") ?? undefined,
  };
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = Object.fromEntries(
      parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
    ) as BookingState["errors"];
    return { errors };
  }

  const { email, plan, hours, notes, company, leaderboard } = parsed.data;
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
    const booking = { url, email, plan, notes };
    const quoted = String(formData.get("hourlyQuote") ?? "");
    const expectedHourly = quoted === "" ? null : Number(quoted);
    if (!trial && expectedHourly !== null && (!/^\d+$/.test(quoted) || !Number.isSafeInteger(expectedHourly))) return { message: "Invalid quote. Refresh the page." };
    const runId = trial ? await createTrial({ ...booking, visitor })
      : await createManualOrder({ ...booking, hours: Number(hours) }, expectedHourly);
    // The booking already exists; failing to save listing details must not make the customer book twice.
    await db()`update runs set company_name = ${company || null}, leaderboard_opt_in = ${leaderboard === "on"},
      leaderboard_site = ${siteKey(target.hostname)} where id = ${runId}`
      .catch((e: unknown) => log("error", "Saving leaderboard details failed", { error: errorMessage(e) }));
    destination = `/runs/${runId}`;
  } catch (e) {
    if (e instanceof OrderError) return { message: e.message };
    if (e instanceof postgres.PostgresError && trial && e.message === "trial_ip_limit") {
      return { errors: { hours: "Your network has already used its free trials today. Pick hours to book a paid shift." } };
    }
    if (e instanceof postgres.PostgresError && trial && e.message === "trial_global_limit") {
      return { errors: { hours: "Free trials are fully booked for today. Pick hours to book a paid shift, or try tomorrow." } };
    }
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
  // The booking is saved above, so a failed email never loses it; it is always on /admin.
  const owner = process.env.OWNER_EMAIL;
  if (owner) {
    await sendEmail({
      to: owner,
      replyTo: email,
      subject: `New ${trial ? "free trial" : "paid"} booking: ${PLANS[plan].name}`,
      text: [
        `Plan: ${PLANS[plan].name}`,
        `Shift: ${trial ? `Free trial (${TRIAL_MINUTES} minutes)` : `${hours} hour(s)`}`,
        `Website: ${url}`,
        `Customer email: ${email}`,
        `Company: ${company || "-"} · Leaderboard: ${leaderboard === "on" ? "yes" : "no"}`,
        `Notes: ${notes || "-"}`,
        "",
        `Order: ${appUrl()}${destination}`,
        "Reply to this email to answer the customer.",
      ].join("\n"),
    });
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
  if (!Number.isInteger(MAX_TRIALS_PER_DAY) || MAX_TRIALS_PER_DAY < 1) throw new Error("Invalid MAX_TRIALS_PER_DAY");
  const [run] = await db()<{ id: string }[]>`
    select create_trial(${b.url}, ${b.email}, ${b.plan}, ${TRIAL_MINUTES}, ${b.notes},
      ${emailKey(b.email)}, ${siteKey(new URL(b.url).hostname)}, ${b.visitor}, ${MAX_TRIALS_PER_DAY}, ${TRIALS_PER_IP_PER_DAY}) as id`;
  return run.id;
}
