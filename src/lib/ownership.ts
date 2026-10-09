import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { isIP } from "node:net";

import { db } from "./db";
import { sendGet, type HttpResponse } from "./outbound";

/** Ownership goes stale: a verification older than this must be repeated before active tests run. */
export const VERIFICATION_DAYS = 30;
const DNS_LABEL = "_testshift-verify";
export const VERIFICATION_FILE_PATH = "/.well-known/testshift-verify.txt";
const DNS_TIMEOUT_MS = 5_000;
const FILE_TIMEOUT_MS = 10_000;

export type VerificationMethod = "dns" | "file";

export interface SiteVerification {
  host: string;
  token: string;
  verified_at: Date | null;
  verified_method: VerificationMethod | null;
}

export const newVerificationToken = (): string => randomBytes(24).toString("base64url");

/** Where the DNS record goes. IP addresses have no DNS names, so only the file method applies to them. */
export const dnsRecordName = (host: string): string | null => (isIP(host.replace(/^\[|\]$/g, "")) ? null : `${DNS_LABEL}.${host}`);
export const dnsRecordValue = (token: string): string => `testshift-verify=${token}`;

/** A TXT record can be split into chunks; they are joined before comparing. */
export function txtRecordsMatch(records: string[][], token: string): boolean {
  const expected = dnsRecordValue(token);
  return records.some((chunks) => chunks.join("") === expected);
}

export const fileMatches = (body: string, token: string): boolean => body.trim() === token;

export interface OwnershipLookups {
  resolveTxt: (name: string) => Promise<string[][]>;
  fetchFile: (url: URL) => Promise<HttpResponse>;
}

const liveLookups: OwnershipLookups = {
  resolveTxt: (name) => withTimeout(resolveTxt(name), DNS_TIMEOUT_MS),
  fetchFile: (url) => sendGet(url, { timeoutMs: FILE_TIMEOUT_MS }),
};

/**
 * Looks for the token in DNS first, then in the site's own file. Only https is trusted for the file, so a plain
 * http response can't be spoofed on the network. Any lookup error counts as "not found yet", never as verified.
 */
export async function checkOwnership(host: string, token: string, lookups: OwnershipLookups = liveLookups): Promise<VerificationMethod | null> {
  const name = dnsRecordName(host);
  if (name) {
    const records = await lookups.resolveTxt(name).catch(() => []);
    if (txtRecordsMatch(records, token)) return "dns";
  }
  const file = await lookups.fetchFile(new URL(VERIFICATION_FILE_PATH, `https://${host}`)).catch(() => null);
  if (file && file.status === 200 && !file.truncated && fileMatches(file.body, token)) return "file";
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Lookup timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** The verification record for a host, created on first use. Safe to call repeatedly. */
export async function getOrCreateVerification(host: string): Promise<SiteVerification> {
  const [row] = await db()<SiteVerification[]>`
    insert into site_verifications (host, token) values (${host}, ${newVerificationToken()})
    on conflict (host) do update set host = excluded.host
    returning host, token, verified_at, verified_method`;
  return row;
}

export async function markVerified(host: string, method: VerificationMethod): Promise<void> {
  await db()`update site_verifications set verified_at = now(), verified_method = ${method} where host = ${host}`;
}

/** True only while the most recent verification is fresh. Active tests call this before every run. */
export async function isSiteVerified(host: string): Promise<boolean> {
  const [row] = await db()<{ ok: boolean }[]>`
    select coalesce(verified_at > now() - make_interval(days => ${VERIFICATION_DAYS}), false) as ok
    from site_verifications where host = ${host}`;
  return row?.ok ?? false;
}
