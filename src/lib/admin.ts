import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

const COOKIE = "ts_admin";
const SESSION_HOURS = 12;

const sha256 = (value: string) => createHash("sha256").update(value).digest();
const sign = (expires: number, password: string) =>
  createHmac("sha256", password).update(`testshift-admin:${expires}`).digest("hex");

/** The dashboard only exists when ADMIN_PASSWORD is set. */
export const adminConfigured = (): boolean => Boolean(process.env.ADMIN_PASSWORD);

/** Constant-time check of a submitted password against ADMIN_PASSWORD. */
export function passwordMatches(input: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  return Boolean(password) && timingSafeEqual(sha256(input), sha256(password ?? ""));
}

/** Session cookie: "<expiry>.<hmac>". Changing ADMIN_PASSWORD signs everyone out. */
export async function startAdminSession(): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;
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
  const password = process.env.ADMIN_PASSWORD;
  const value = (await cookies()).get(COOKIE)?.value;
  if (!password || !value) return false;
  const [expiresText, signature = ""] = value.split(".");
  const expires = Number(expiresText);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = sign(expires, password);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
