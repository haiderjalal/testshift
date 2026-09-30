import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { db } from "./db";

/**
 * A hashed identifier for the visitor's IP (the raw address is never stored). On Vercel the first
 * x-forwarded-for entry is set by the platform; self-hosted setups must put a trusted proxy in front.
 */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`testshift-ip:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Records one hit in `bucket` and says whether it is within `limit` hits per `windowSeconds`.
 * ponytail: one Postgres row per hit; move to Redis or Vercel Firewall rules if traffic gets large.
 */
export async function allow(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const [{ hits }] = await db()<{ hits: number }[]>`
    with added as (insert into rate_limit_hits (bucket) values (${bucket}) returning 1)
    select (select count(*) from rate_limit_hits
      where bucket = ${bucket} and created_at > now() - make_interval(secs => ${windowSeconds}))::int + 1 as hits`;
  // Occasional clean-up keeps the table small without a scheduled job.
  if (Math.random() < 0.02) await db()`delete from rate_limit_hits where created_at < now() - interval '2 days'`;
  return hits <= limit;
}
