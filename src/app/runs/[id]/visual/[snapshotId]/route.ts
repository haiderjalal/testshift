import { db, isUuid } from "@/lib/db";
import { log } from "@/lib/log";
import { configuredImageStore } from "@/lib/image-store";

const KINDS = ["current", "baseline", "diff"] as const;
type Kind = (typeof KINDS)[number];

/** Serves one visual image for one snapshot of one run. The private bucket is never exposed directly. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/runs/[id]/visual/[snapshotId]">,
): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const reply = (status: number) => new Response("Image not available.", {
    status, headers: { "Cache-Control": "private, no-store", "X-Request-ID": requestId, "X-Robots-Tag": "noindex, nofollow" },
  });
  try {
    const { id, snapshotId } = await params;
    const kind = new URL(request.url).searchParams.get("kind");
    if (!isUuid(id) || !isUuid(snapshotId) || !KINDS.includes(kind as Kind)) return reply(404);

    const [row] = await db()<{ storage_key: string; baseline_key: string | null; diff_key: string | null }[]>`
      select storage_key, baseline_key, diff_key from visual_snapshots where id = ${snapshotId} and run_id = ${id}`;
    if (!row) return reply(404);
    const key = kind === "current" ? row.storage_key : kind === "baseline" ? row.baseline_key : row.diff_key;
    if (!key) return reply(404);

    const store = configuredImageStore();
    const bytes = store ? await store.get(key) : null;
    if (!bytes) return reply(404);

    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "X-Request-ID": requestId },
    });
  } catch {
    log("error", "Visual image retrieval failed", { requestId });
    return reply(503);
  }
}
