"use server";

import { revalidatePath } from "next/cache";

import { actionRequest } from "@/lib/action-security";
import { db, isUuid } from "@/lib/db";
import { log } from "@/lib/log";
import { emailKey } from "@/lib/net";

/**
 * Makes a snapshot's screenshot the approved baseline for its host, page and viewport. Future shifts compare
 * against it. Only the customer who holds the report link can reach this action.
 */
export async function approveVisualSnapshot(formData: FormData): Promise<void> {
  if (!(await actionRequest(formData))) return;
  const runId = String(formData.get("runId") ?? "");
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!isUuid(runId) || !isUuid(snapshotId)) return;

  const approved = await db().begin(async (sql) => {
    // The baseline is keyed by the booker, so approving one customer's screenshot cannot overwrite or expose
    // another customer's baseline for the same host.
    const [snapshot] = await sql<{ host: string; path: string; viewport: string; storage_key: string; width: number; height: number; email_key: string }[]>`
      select s.host, s.path, s.viewport, s.storage_key, s.width, s.height, coalesce(r.email, '') as email_key
      from visual_snapshots s join runs r on r.id = s.run_id
      where s.id = ${snapshotId} and s.run_id = ${runId}`;
    if (!snapshot) return false;
    const key = emailKey(snapshot.email_key);
    await sql`
      insert into visual_baselines (host, path, viewport, email_key, storage_key, width, height, approved_run_id, approved_at)
      values (${snapshot.host}, ${snapshot.path}, ${snapshot.viewport}, ${key}, ${snapshot.storage_key}, ${snapshot.width}, ${snapshot.height}, ${runId}, now())
      on conflict (host, path, viewport, email_key) do update set
        storage_key = excluded.storage_key, width = excluded.width, height = excluded.height,
        approved_run_id = excluded.approved_run_id, approved_at = now()`;
    return true;
  });
  if (approved) log("info", "Visual baseline approved", { runId });
  revalidatePath(`/runs/${runId}`);
}
