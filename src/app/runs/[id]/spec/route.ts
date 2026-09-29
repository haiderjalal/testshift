import { db, isUuid, type TestCase } from "@/lib/db";
import { buildSpec } from "@/lib/spec";

export async function GET(_request: Request, { params }: RouteContext<"/runs/[id]/spec">): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Report not found.", { status: 404 });
  const [run] = await db()<{ url: string }[]>`select url from runs where id = ${id} and status = 'completed'`;
  if (!run) return new Response("Report not found.", { status: 404 });

  const cases = await db()<TestCase[]>`
    select seq, agent, title, viewport, expected, status, actual, severity, actions
    from test_cases where run_id = ${id} order by seq`;
  const host = new URL(run.url).hostname.replace(/[^a-z0-9.-]/gi, "");

  return new Response(buildSpec(run.url, cases), {
    headers: {
      "Content-Type": "text/typescript; charset=utf-8",
      "Content-Disposition": `attachment; filename="${host}.spec.ts"`,
    },
  });
}
