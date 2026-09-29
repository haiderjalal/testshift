import { db, isUuid } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/runs/[id]/shots/[caseId]">,
): Promise<Response> {
  const { id, caseId } = await params;
  if (!isUuid(id) || !isUuid(caseId)) return new Response("Not found.", { status: 404 });
  const [row] = await db()<{ screenshot: Buffer | null }[]>`
    select screenshot from test_cases where id = ${caseId} and run_id = ${id}`;
  if (!row?.screenshot) return new Response("Not found.", { status: 404 });

  return new Response(new Uint8Array(row.screenshot), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
