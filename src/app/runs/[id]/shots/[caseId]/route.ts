import { db, isUuid } from "@/lib/db";
import { log } from "@/lib/log";

export async function GET(
  request: Request,
  { params }: RouteContext<"/runs/[id]/shots/[caseId]">,
): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const reply = (status: number) => new Response("Report not available.", {
    status, headers: { "Cache-Control": "private, no-store", "X-Request-ID": requestId, "X-Robots-Tag": "noindex, nofollow" },
  });
  try {
    const { id, caseId } = await params;
    if (!isUuid(id) || !isUuid(caseId)) return reply(404);
    const [row] = await db()<{ screenshot: Buffer | null }[]>`
      select screenshot from test_cases where id = ${caseId} and run_id = ${id}`;
    if (!row?.screenshot) return reply(404);

    return new Response(new Uint8Array(row.screenshot), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Request-ID": requestId },
    });
  } catch {
    log("error", "Screenshot retrieval failed", { requestId });
    return reply(503);
  }
}
