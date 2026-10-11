import { isUuid } from "@/lib/db";
import { log } from "@/lib/log";

import { getDocumentFile } from "./store";

const TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

/**
 * A finished document's PDF or Word file. Documents are private links: the file is only sent for a completed document
 * whose id is a valid UUID, and it is never cached or indexed.
 */
export async function documentFileResponse(id: string, format: keyof typeof TYPES, requestId: string): Promise<Response> {
  const reply = (status: number) =>
    new Response("File not available.", {
      status,
      headers: { "Cache-Control": "private, no-store", "X-Request-ID": requestId, "X-Robots-Tag": "noindex, nofollow" },
    });
  try {
    if (!isUuid(id)) return reply(404);
    const file = await getDocumentFile(id, format);
    if (!file) return reply(404);
    const host = file.host.replace(/[^a-z0-9.-]/gi, "");
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": TYPES[format],
        "Content-Length": String(file.content.byteLength),
        "X-Request-ID": requestId,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Disposition": `attachment; filename="${host}-test-cases.${format}"`,
      },
    });
  } catch {
    log("error", "Test case file export failed", { requestId, format });
    return reply(503);
  }
}
