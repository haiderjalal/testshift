"use server";

import { revalidatePath } from "next/cache";

import { actionRequest } from "@/lib/action-security";
import { isAdmin } from "@/lib/admin";
import { db, isUuid } from "@/lib/db";
import { errorMessage, log } from "@/lib/log";
import { approveRequirementTest, FINISHED_STATUSES } from "@/lib/requirement-approval";

/** Asks the worker to generate tests from a run's requirements. The worker picks it up when idle. */
export async function requestRequirementTests(formData: FormData): Promise<void> {
  if (!(await actionRequest(formData)) || !(await isAdmin())) return;
  const runId = String(formData.get("runId") ?? "");
  if (!isUuid(runId)) return;
  await db()`
    update runs set requirements_requested_at = now()
    where id = ${runId} and requirements is not null and status <> all(${FINISHED_STATUSES})`;
  revalidatePath("/admin");
}

/**
 * Approves or rejects one proposed test. Approval turns it into a pending test on the run, carrying the
 * requirement it traces to. Approved tests then run like any other test in the shift.
 */
export async function decideRequirementTest(formData: FormData): Promise<void> {
  if (!(await actionRequest(formData)) || !(await isAdmin())) return;
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!isUuid(id) || (decision !== "approve" && decision !== "reject")) return;
  try {
    if (decision === "reject") {
      await db()`update requirement_tests set status = 'rejected' where id = ${id} and status = 'proposed'`;
    } else {
      await approveRequirementTest(id);
    }
  } catch (e) {
    log("error", "Requirement test decision failed", { error: errorMessage(e) });
  }
  revalidatePath("/admin");
}

