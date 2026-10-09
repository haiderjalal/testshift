import type postgres from "postgres";
import { digest } from "./crypto";
export async function saveState(sql: postgres.Sql, state: string, browser: string, purpose: "login" | "install", verifier: string, userId?: string) {
  await sql`delete from github_states where expires_at < now()`;
  await sql`insert into github_states (state_hash,browser_hash,purpose,verifier,user_id,expires_at)
    values (${digest(state)},${digest(browser)},${purpose},${verifier},${userId ?? null},now() + interval '10 minutes')`;
}
export async function takeState(sql: postgres.Sql, state: string | null, browser: string | undefined, purpose: "login" | "install") {
  if (!state || !browser || !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(browser)) return null;
  const rows = await sql<{ verifier: string; user_id: string | null }[]>`delete from github_states
    where state_hash = ${digest(state)} and browser_hash = ${digest(browser)} and purpose = ${purpose} and expires_at > now()
    returning verifier,user_id::text`;
  return rows[0] ?? null;
}
