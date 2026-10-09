import { db, isUuid, type TestCase } from "@/lib/db";
import { buildSpec } from "@/lib/spec";
import { log } from "@/lib/log";

export async function GET(request: Request, { params }: RouteContext<"/runs/[id]/spec">): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const reply = (status: number) => new Response("Report not available.", {
    status, headers: { "Cache-Control": "private, no-store", "X-Request-ID": requestId, "X-Robots-Tag": "noindex, nofollow" },
  });
  try {
    const { id } = await params;
    if (!isUuid(id)) return reply(404);
    const [run] = await db()<{ url: string }[]>`select url from runs where id = ${id} and status = 'completed'`;
    if (!run) return reply(404);

    const cases = await db()<TestCase[]>`
      select seq, agent, title, viewport, expected, status, actual, severity, actions, failure_assertion
      from test_cases where run_id = ${id} order by seq`;
    const host = new URL(run.url).hostname.replace(/[^a-z0-9.-]/gi, "");

    return new Response(buildSpec(run.url, cases), {
      headers: {
        "Content-Type": "text/typescript; charset=utf-8",
        "X-Request-ID": requestId,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Disposition": `attachment; filename="${host}.spec.ts"`,
      },
    });
  } catch {
    log("error", "Report export failed", { requestId });
    return reply(503);
  }
}
