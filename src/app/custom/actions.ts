"use server";

import { z } from "zod";

import { db } from "@/lib/db";
import { errorMessage, log } from "@/lib/log";

export interface CustomState {
  sent?: boolean;
  message?: string;
  errors?: Partial<Record<"name" | "email" | "company" | "website" | "details", string>>;
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
  // Honeypot: people never see this field, bots fill it in. Pretend success so bots learn nothing.
  if (String(formData.get("fax") ?? "") !== "") return { sent: true };

  const parsed = schema.safeParse({
    name: formData.get("name") ?? "",
    email: String(formData.get("email") ?? "").trim(),
    company: formData.get("company") ?? "",
    website: formData.get("website") ?? "",
    details: formData.get("details") ?? "",
  });
  if (!parsed.success) {
    return {
      errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) as CustomState["errors"],
    };
  }

  const { name, email, company, website, details } = parsed.data;
  try {
    await db()`
      insert into custom_requests (name, email, company, website, message)
      values (${name}, ${email}, ${company}, ${website}, ${details})`;
  } catch (e) {
    log("error", "Custom request failed", { error: errorMessage(e) });
    return { message: "We couldn't send your request. Please try again in a minute." };
  }
  log("info", "Custom pricing request received");
  return { sent: true };
}
