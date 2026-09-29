import { errorMessage, log } from "./log";

interface Email {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

/**
 * Sends a plain-text email through Resend. Returns false (and logs) instead of throwing:
 * callers save their data first, so a failed email never loses a submission.
 */
export async function sendEmail({ to, subject, text, replyTo }: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    log("warn", "Email not configured (RESEND_API_KEY / EMAIL_FROM); skipping", { subject });
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        // Header values must be single-line.
        subject: subject.replace(/[\r\n]+/g, " ").slice(0, 200),
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      log("error", "Email failed", { status: res.status, subject });
      return false;
    }
    return true;
  } catch (e) {
    log("error", "Email failed", { error: errorMessage(e), subject });
    return false;
  }
}
