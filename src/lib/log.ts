type Level = "info" | "warn" | "error";

/** Structured one-line JSON logs. Never pass customer emails, notes or secrets in `data`. */
export function log(level: Level, message: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
