import { cookies } from "next/headers";
import { db } from "../db";
import { digest, opaque, openToken, sealToken } from "./crypto";
import { saveState, takeState } from "./auth-store";

export const CUSTOMER_COOKIE = "ts_github";
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
export interface Customer { user_id: string; login: string; encrypted_token: string; token_hash: string }
export async function customerSession(): Promise<Customer | null> {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rows = await db()<Customer[]>`select s.user_id::text, u.login, s.encrypted_token, s.token_hash from github_sessions s
    join github_users u on u.id = s.user_id where s.token_hash = ${digest(token)} and s.expires_at > now()`;
  return rows[0] ?? null;
}
export const customerToken = (customer: Customer) => openToken(customer.encrypted_token, customer.user_id);
export async function createCustomerSession(userId: number, login: string, token: string, expiresIn: number): Promise<void> {
  const secret = opaque();
  const seconds = Math.max(60, Math.min(3600, expiresIn));
  const previous = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  await db().begin(async (sql) => {
    await sql`delete from github_sessions where expires_at < now()`;
    if (previous) await sql`delete from github_sessions where token_hash = ${digest(previous)}`;
    await sql`insert into github_users (id,login) values (${userId},${login}) on conflict (id) do update set login = excluded.login`;
    await sql`insert into github_sessions (token_hash,user_id,encrypted_token,expires_at)
      values (${digest(secret)},${userId},${sealToken(token, String(userId))},now() + ${seconds} * interval '1 second')`;
  });
  (await cookies()).set(CUSTOMER_COOKIE, secret, { ...cookieOptions, maxAge: seconds });
}
export async function startState(purpose: "login" | "install", userId?: string) {
  const state = opaque(); const browser = opaque(); const verifier = opaque();
  await saveState(db(), state, browser, purpose, verifier, userId);
  (await cookies()).set(`ts_github_${purpose}`, browser, { ...cookieOptions, path: "/api/github", maxAge: 600 });
  return { state, verifier };
}
export async function consumeState(state: string | null, purpose: "login" | "install") {
  const browser = (await cookies()).get(`ts_github_${purpose}`)?.value;
  const result = await takeState(db(), state, browser, purpose);
  (await cookies()).delete({ name: `ts_github_${purpose}`, path: "/api/github" });
  return result;
}
