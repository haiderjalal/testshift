import type { ApiCheck } from "@/lib/api/checks";
import { buildPostmanCollection } from "@/lib/api/postman-export";
import { db, isUuid } from "@/lib/db";
import { log } from "@/lib/log";

/** The Postman collection of the operations this shift saw pass. Completed shifts only, like the other exports. */
export async function GET(request: Request, { params }: RouteContext<"/runs/[id]/postman">): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const reply = (status: number) => new Response("Export not available.", {
    status, headers: { "Cache-Control": "private, no-store", "X-Request-ID": requestId, "X-Robots-Tag": "noindex, nofollow" },
  });
  try {
    const { id } = await params;
    if (!isUuid(id)) return reply(404);
    const [run] = await db()<{ url: string; completed_at: Date | null }[]>`select url, completed_at from runs where id = ${id} and status = 'completed'`;
    if (!run) return reply(404);

    const rows = await db()<{ method: string; path: string; status_code: number | null; checks: ApiCheck[] }[]>`
      select method, path, status_code, checks from api_checks
      where run_id = ${id} and passed = true and skipped_reason is null order by created_at, id`;
    const host = new URL(run.url).hostname.replace(/[^a-z0-9.-]/gi, "");
    const collection = buildPostmanCollection({
      host,
      origin: new URL(run.url),
      exportedAt: run.completed_at ?? new Date(),
      rows: rows.map((row) => ({ method: row.method, path: row.path, statusCode: row.status_code, checks: row.checks })),
    });

    return new Response(JSON.stringify(collection, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Request-ID": requestId,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Disposition": `attachment; filename="${host}.postman_collection.json"`,
      },
    });
  } catch {
    log("error", "Postman export failed", { requestId });
    return reply(503);
  }
}
