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
  // A single visitor usually controls a whole IPv6 /64, so limiting per /128 would let them rotate freely.
  // Key IPv6 on the /64 prefix; IPv4 stays per address.
  const ip = family === 6 ? ipv6Prefix64(candidate) : family === 4 ? candidate : "unknown";
  return createHash("sha256").update(`testshift-ip:${ip}`).digest("hex").slice(0, 32);
}

/** The /64 network of an IPv6 address: its first four hextets, fully expanded. */
function ipv6Prefix64(address: string): string {
  const full = new URL(`http://[${address}]/`).hostname.replace(/^\[|\]$/g, "");
  // Expand "::" so the first four groups are positional, then take them.
  const [head, tail = ""] = full.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array(Math.max(0, missing)).fill("0"), ...tailGroups];
  return groups.slice(0, 4).map((g) => g || "0").join(":") + "::/64";
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
