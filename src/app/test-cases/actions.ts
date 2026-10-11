"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { actionRequest } from "@/lib/action-security";
import { createDocumentRequest, type LimitReason } from "@/lib/documents/store";
import { errorMessage, log } from "@/lib/log";
import { isPublicHost, siteKey } from "@/lib/net";
import { normalizeText } from "@/lib/security";
import { clientKey } from "@/lib/rateLimit";

export interface TestCaseState {
  message?: string;
  errors?: Partial<Record<"url" | "email" | "notes" | "consent", string>>;
}

const LIMIT_MESSAGES: Record<LimitReason, string> = {
  visitor: "You have already requested the maximum number of test case documents today. Please try again tomorrow.",
  site: "Test cases for this site were already requested today. Please try again tomorrow.",
  day: "We have reached today's limit for test case documents. Please try again tomorrow.",
};

const schema = z.object({
  url: z
    .url({ protocol: /^https?$/i, error: "Enter the full link, like https://your-site.com" })
    .max(2000, { error: "That link is too long." }),
  email: z.email({ error: "Enter an email address so we can send you the link." }).max(254),
  notes: z.string().max(500, { error: "Keep the notes under 500 characters." }),
  consent: z.literal("on", { error: "Confirm you're allowed to have this site described." }),
});

export async function requestTestCases(_prev: TestCaseState, formData: FormData): Promise<TestCaseState> {
  const requestId = await actionRequest(formData);
  if (!requestId) return { message: "Request rejected. Refresh and try again." };
  // Honeypot: people never see this field, so anything in it came from a bot.
  if (String(formData.get("fax") ?? "") !== "") return { message: "Request rejected. Refresh and try again." };

  const parsed = schema.safeParse({
    url: String(formData.get("url") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    notes: normalizeText(String(formData.get("notes") ?? "")),
    consent: formData.get("consent"),
  });
  if (!parsed.success) {
    return { errors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])) as TestCaseState["errors"] };
  }

  const target = new URL(parsed.data.url);
  if (target.username || target.password) return { errors: { url: "Remove the username or password from the link." } };
  target.hostname = target.hostname.replace(/\.$/, "");
  // Only the standard web ports: the fetchers would otherwise reach other services on a public host.
  if (target.port && target.port !== "80" && target.port !== "443") {
    return { errors: { url: "We test sites on the standard web ports (80 and 443). Remove the port from the link." } };
  }
  if (!(await isPublicHost(target.hostname))) {
    return { errors: { url: "We can only describe websites that are publicly reachable on the internet." } };
  }

  let id: string;
  try {
    const result = await createDocumentRequest({
      url: target.href,
      host: target.hostname,
      siteKey: siteKey(target.hostname),
      email: parsed.data.email,
      notes: parsed.data.notes,
      visitor: await clientKey(),
    });
    if ("limit" in result) return { message: LIMIT_MESSAGES[result.limit] };
    id = result.id;
  } catch (e) {
    log("error", "Test case request failed", { requestId, error: errorMessage(e) });
    return { message: "We couldn't start your request. Please try again in a minute." };
  }
  log("info", "Test case document requested", { requestId, documentId: id });
  redirect(`/test-cases/${id}`);
}
