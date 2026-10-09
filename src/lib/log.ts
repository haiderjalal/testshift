import { createHash } from "node:crypto";

type Level = "info" | "warn" | "error";

/** Structured one-line JSON logs. Never pass customer emails, notes or secrets in `data`. */
export function log(level: Level, message: string, data: Record<string, unknown> = {}): void {
  // A closed set prevents accidental logging of request bodies, URLs, credentials and customer data.
  const keys = new Set(["requestId", "runId", "status", "kind", "operation", "agent", "attempt", "seq", "score", "tests", "minutesPerHour", "error", "plan", "minutes", "trial", "stopReason"]);
  const safe = Object.fromEntries(Object.entries(data).filter(([key]) => keys.has(key)));
  // A run UUID is a bearer capability for its report. Keep a correlation hash, never the capability.
  if (typeof safe.runId === "string") safe.runId = createHash("sha256").update(safe.runId).digest("hex").slice(0, 16);
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errorMessage(error: unknown): string {
  // Provider/SQL/Playwright messages can include credentials, emails, bodies and private report links.
  if (!(error instanceof Error)) return "UnknownError";
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) ? error.name : "Error";
}
