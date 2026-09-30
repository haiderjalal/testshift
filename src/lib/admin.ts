import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

const COOKIE = "ts_admin";
const SESSION_HOURS = 12;
/** Short passwords are refused outright: the dashboard shows revenue and customer requests. */
export const MIN_PASSWORD_LENGTH = 16;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

// The cookie is signed with a key stretched from the password (scrypt), never the password itself, so a
// leaked cookie can't be used to brute-force the password cheaply offline. Cached per password.
let signingKey: { password: string; key: Buffer } | null = null;
function keyFor(password: string): Buffer {
  if (signingKey?.password !== password) {
    signingKey = { password, key: scryptSync(password, "testshift-admin-session-v1", 32, { N: 2 ** 15, maxmem: 64 * 1024 * 1024 }) };
  }
  return signingKey.key;
}
const sign = (expires: number, password: string) =>
  createHmac("sha256", keyFor(password)).update(`testshift-admin:${expires}`).digest("hex");

const configuredPassword = (): string | null => {
  const password = process.env.ADMIN_PASSWORD ?? "";
  return password.length >= MIN_PASSWORD_LENGTH ? password : null;
};

/** The dashboard only exists when ADMIN_PASSWORD is set and at least MIN_PASSWORD_LENGTH characters. */
export const adminConfigured = (): boolean => configuredPassword() !== null;

/** Constant-time check of a submitted password against ADMIN_PASSWORD. */
export function passwordMatches(input: string): boolean {
  const password = configuredPassword();
  return password !== null && timingSafeEqual(sha256(input), sha256(password));
}

/** Session cookie: "<expiry>.<hmac>". Changing ADMIN_PASSWORD signs everyone out. */
export async function startAdminSession(): Promise<void> {
  const password = configuredPassword();
  if (!password) return;
  const expires = Date.now() + SESSION_HOURS * 3_600_000;
  (await cookies()).set(COOKIE, `${expires}.${sign(expires, password)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: SESSION_HOURS * 3_600,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete({ name: COOKIE, path: "/admin" });
}

export async function isAdmin(): Promise<boolean> {
  const password = configuredPassword();
  const value = (await cookies()).get(COOKIE)?.value;
  if (!password || !value) return false;
  const [expiresText, signature = ""] = value.split(".");
  const expires = Number(expiresText);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = sign(expires, password);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
