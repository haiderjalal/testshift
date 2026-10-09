"use server";

import { revalidatePath } from "next/cache";

import { db, isUuid } from "@/lib/db";
import { log } from "@/lib/log";

/**
 * Makes a snapshot's screenshot the approved baseline for its host, page and viewport. Future shifts compare
 * against it. Only the customer who holds the report link can reach this action.
 */
export async function approveVisualSnapshot(formData: FormData): Promise<void> {
  const runId = String(formData.get("runId") ?? "");
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!isUuid(runId) || !isUuid(snapshotId)) return;

  const approved = await db().begin(async (sql) => {
    const [snapshot] = await sql<{ host: string; path: string; viewport: string; storage_key: string; width: number; height: number }[]>`
      select host, path, viewport, storage_key, width, height from visual_snapshots where id = ${snapshotId} and run_id = ${runId}`;
    if (!snapshot) return false;
    await sql`
      insert into visual_baselines (host, path, viewport, storage_key, width, height, approved_run_id, approved_at)
      values (${snapshot.host}, ${snapshot.path}, ${snapshot.viewport}, ${snapshot.storage_key}, ${snapshot.width}, ${snapshot.height}, ${runId}, now())
      on conflict (host, path, viewport) do update set
        storage_key = excluded.storage_key, width = excluded.width, height = excluded.height,
        approved_run_id = excluded.approved_run_id, approved_at = now()`;
    return true;
  });
  if (approved) log("info", "Visual baseline approved", { runId });
  revalidatePath(`/runs/${runId}`);
}
