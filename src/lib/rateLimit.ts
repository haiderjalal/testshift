import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { headers } from "next/headers";

import { db } from "./db";

/**
 * A hashed identifier for the visitor's IP (the raw address is never stored). On Vercel the first
 * x-forwarded-for entry is set by the platform. Self-hosted setups must explicitly opt into a
 * trusted proxy which OVERWRITES forwarded headers. Otherwise visitors share a fail-closed bucket.
 */
export async function clientKey(): Promise<string> {
  const h = await headers();
  return visitorKey(h, process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "1");
}

export function visitorKey(h: Pick<Headers, "get">, trustProxy: boolean): string {
  const candidate = trustProxy ? h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "" : "";
  const family = isIP(candidate);
  const ip = family === 6 ? new URL(`http://[${candidate}]/`).hostname : family === 4 ? candidate : "unknown";
  return createHash("sha256").update(`testshift-ip:${ip}`).digest("hex").slice(0, 32);
}

/**
 * One atomic, bounded counter per bucket; denied requests do not grow the table.
 */
export async function allow(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const [{ allowed }] = await db()<{ allowed: boolean }[]>`
    select consume_rate_limit(${bucket}, ${limit}, ${windowSeconds}) as allowed`;
  // Occasional clean-up keeps the table small without a scheduled job.
  if (Math.random() < 0.02) await db()`delete from rate_limit_windows where window_started_at < now() - interval '2 days'`;
  return allowed;
}
