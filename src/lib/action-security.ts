import { headers } from "next/headers";
import { appUrl } from "./email";
import { sameOrigin, validForm } from "./security";
import { log } from "./log";

/** Action-layer check also protects requests dispatched without Proxy. */
export async function actionRequest(data?: FormData): Promise<string | null> {
  const h = await headers();
  const requestId = h.get("x-request-id") ?? crypto.randomUUID();
  if (!sameOrigin(h.get("origin"), appUrl()) || (data && !validForm(data))) {
    log("warn", "Action rejected", { requestId });
    return null;
  }
  return requestId;
}
