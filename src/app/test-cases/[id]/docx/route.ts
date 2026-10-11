import { documentFileResponse } from "@/lib/documents/download";

export async function GET(request: Request, { params }: RouteContext<"/test-cases/[id]/docx">): Promise<Response> {
  const { id } = await params;
  return documentFileResponse(id, "docx", request.headers.get("x-request-id") ?? crypto.randomUUID());
}
