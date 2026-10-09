"use server";

import { z } from "zod";
import { actionRequest } from "@/lib/action-security";
import { normalizeText } from "@/lib/security";
import { repositoryBrief, repositoryRequest } from "@/lib/repository-testing";

import { db } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { errorMessage, log } from "@/lib/log";
import { allow, clientKey } from "@/lib/rateLimit";

const QUOTES_PER_IP_PER_HOUR = 5;

export interface CustomState {
  sent?: boolean;
  message?: string;
  errors?: Partial<Record<"name" | "email" | "company" | "website" | "details" | "mode" | "repository" | "destructive", string>>;
}

const schema = z.object({
  name: z.string().trim().min(1, { error: "Tell us your name." }).max(120, { error: "Keep your name under 120 characters." }),
  email: z.email({ error: "Enter an email address so we can reply." }).max(254),
  company: z.string().trim().max(120, { error: "Keep the company name under 120 characters." }),
  website: z.string().trim().max(300, { error: "Keep the website under 300 characters." }),
  details: z
    .string()
    .trim()
    .min(10, { error: "Tell us a little more about what you need (at least 10 characters)." })
    .max(3000, { error: "Keep it under 3,000 characters." }),
});

export async function requestQuote(_prev: CustomState, formData: FormData): Promise<CustomState> {
  const requestId = await actionRequest(formData);
  if (!requestId) return { message: "Request rejected. Refresh and try again." };
  // Honeypot: people never see this field, bots fill it in. Pretend success so bots learn nothing.
  if (String(formData.get("fax") ?? "") !== "") return { sent: true };

  const parsed = schema.safeParse({
    name: normalizeText(String(formData.get("name") ?? "")),
    email: String(formData.get("email") ?? "").trim(),
    company: normalizeText(String(formData.get("company") ?? "")),
    website: normalizeText(String(formData.get("website") ?? "")),
    details: normalizeText(String(formData.get("details") ?? "")),
  });
  const scope = repositoryRequest.safeParse({
    mode: formData.get("mode") ?? "website",
    repository: formData.get("repository") ?? "",
    destructive: formData.get("destructive") ?? "",
  });
  if (!scope.success) return { errors: Object.fromEntries(scope.error.issues.map((issue) => [String(issue.path[0]), issue.message])) as CustomState["errors"] };
  if (!parsed.success) {
    return {
      errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) as CustomState["errors"],
    };
  }

  const { name, email, company, website, details } = parsed.data;
  const brief = repositoryBrief(scope.data, details);
  if (brief.length > 3000) return { errors: { details: "Shorten your request so the repository details and message fit within 3,000 characters." } };
  try {
    if (!(await allow(`quote:${await clientKey()}`, QUOTES_PER_IP_PER_HOUR, 3_600))) {
      return { message: "You've sent several requests already. We'll reply to those first." };
    }
    await db()`
      insert into custom_requests (name, email, company, website, message)
      values (${name}, ${email}, ${company}, ${website}, ${brief})`;
  } catch (e) {
    log("error", "Custom request failed", { requestId, error: errorMessage(e) });
    return { message: "We couldn't send your request. Please try again in a minute." };
  }
  log("info", "Custom pricing request received", { requestId });

  // Saved above first, so the request is never lost if the email fails; it is always on /admin.
  const owner = process.env.OWNER_EMAIL;
  if (owner) {
    await sendEmail({
      to: owner,
      replyTo: email,
      subject: `New custom pricing request from ${name}${company ? ` (${company})` : ""}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        `Company: ${company || "-"}`,
        `Website: ${website || "-"}`,
        "",
        "What they need:",
        brief,
        "",
        `Reply to this email to answer them, or see all requests at ${appUrl()}/admin`,
      ].join("\n"),
    });
  }
  return { sent: true };
}
