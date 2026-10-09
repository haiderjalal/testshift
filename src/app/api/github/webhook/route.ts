import { githubConfigured } from "@/lib/github/api";
import { validSignature } from "@/lib/github/crypto";
import { privateHeaders } from "@/lib/github/http";
import { recordWebhook } from "@/lib/github/store";
import { db, isUuid } from "@/lib/db";
import { log } from "@/lib/log";
import { readBoundedBody, RequestError, WEBHOOK_BODY_LIMIT } from "@/lib/security";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const respond = (status: number, message: string) => Response.json({ message, requestId }, { status, headers: privateHeaders });
  if (!githubConfigured()) return respond(503, "GitHub integration is not configured.");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return respond(415, "Request rejected.");
  try {
    const body = await readBoundedBody(request, WEBHOOK_BODY_LIMIT);
    if (!validSignature(body, request.headers.get("x-hub-signature-256"), process.env.GITHUB_WEBHOOK_SECRET!)) return respond(401, "Request rejected.");
    const delivery = request.headers.get("x-github-delivery") ?? "";
    const event = request.headers.get("x-github-event") ?? "";
    if (!isUuid(delivery) || !/^[a-z_]{1,80}$/.test(event)) return respond(400, "Request rejected.");
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { return respond(400, "Request rejected."); }
    if (!["ping", "installation", "installation_repositories", "github_app_authorization", "workflow_run"].includes(event)) return respond(202, "Event ignored.");
    const result = await recordWebhook(db(), delivery, event, payload);
    return respond(200, result);
  } catch (error) {
    if (error instanceof RequestError) return respond(error.status, "Request rejected.");
    if (error instanceof Error && error.name === "ZodError") return respond(400, "Request rejected.");
    log("error", "GitHub webhook unavailable", { requestId });
    return respond(503, "Retry delivery later.");
  }
}
