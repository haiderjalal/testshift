import { createHash } from "node:crypto";

type Level = "info" | "warn" | "error";

/** Structured one-line JSON logs. Never pass customer emails, notes or secrets in `data`. */
export function log(level: Level, message: string, data: Record<string, unknown> = {}): void {
  // A closed set prevents accidental logging of request bodies, URLs, credentials and customer data.
  const keys = new Set(["requestId", "runId", "documentId", "status", "kind", "operation", "agent", "attempt", "seq", "score", "tests", "minutesPerHour", "error", "plan", "minutes", "trial", "stopReason"]);
  const safe = Object.fromEntries(Object.entries(data).filter(([key]) => keys.has(key)));
  // A run or document UUID is a bearer capability for its page. Keep a correlation hash, never the capability.
  for (const key of ["runId", "documentId"] as const) {
    const value = safe[key];
    if (typeof value === "string") safe[key] = createHash("sha256").update(value).digest("hex").slice(0, 16);
  }
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

/**
 * A failure in words an operator can act on. It returns our own wording or a database error code, never driver text,
 * because driver messages can carry a connection string.
 */
export function describeFailure(error: unknown): string {
  // Our own wording for failures we can recognise. Driver text is matched here, never copied into a log.
  if (error instanceof Error && error.name === "DocumentError") return "the site could not be read, so no test cases were written";
  if (error instanceof Error && /Executable doesn't exist/.test(error.message)) {
    return "Chromium is not installed for this version of Playwright. In PowerShell, run: npx.cmd playwright install chromium";
  }
  if (error instanceof Error && error.message.startsWith("DATABASE_URL")) return error.message;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "42P01") return "a table this worker needs is missing; check that its migrations are applied";
  if (typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code)) return `error code ${code}`;
  return errorMessage(error);
}
