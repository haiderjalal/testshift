"use server";

import { revalidatePath } from "next/cache";

import { db, isUuid } from "@/lib/db";
import { errorMessage, log } from "@/lib/log";
import { checkOwnership, getOrCreateVerification, markVerified, type VerificationMethod } from "@/lib/ownership";
import { allow, clientKey } from "@/lib/rateLimit";

// Each check makes outbound requests and a DNS lookup, so a visitor cannot repeat them without limit.
const CHECKS_PER_VISITOR_PER_HOUR = 20;

export interface OwnershipState {
  message?: string;
  verified?: boolean;
  method?: VerificationMethod | null;
}

export async function checkDomainOwnership(_previous: OwnershipState, formData: FormData): Promise<OwnershipState> {
  const runId = String(formData.get("runId") ?? "");
  if (!isUuid(runId)) return { message: "This shift link is not valid." };
  if (!(await allow(`verify:${await clientKey()}`, CHECKS_PER_VISITOR_PER_HOUR, 3_600))) {
    return { message: "You've checked several times this hour. Try again later." };
  }

  const [run] = await db()<{ url: string }[]>`select url from runs where id = ${runId}`;
  if (!run) return { message: "This shift could not be found." };
  const host = new URL(run.url).hostname;

  try {
    const verification = await getOrCreateVerification(host);
    const method = await checkOwnership(host, verification.token);
    if (!method) {
      return { verified: false, message: "We can't see the verification code yet. DNS changes can take a few minutes to appear." };
    }
    await markVerified(host, method);
    log("info", "Domain ownership verified", { runId, method });
    revalidatePath(`/runs/${runId}`);
    return { verified: true, method, message: "Ownership verified." };
  } catch (e) {
    log("error", "Ownership check failed", { runId, error: errorMessage(e) });
    return { message: "The check could not finish. Try again in a minute." };
  }
}
