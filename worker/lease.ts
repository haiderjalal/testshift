import type postgres from "postgres";
import { db } from "@/lib/db";

export class LeaseLostError extends Error {
  constructor() { super("Another worker took over this shift"); }
}

/** Lock the run row for the whole write; a re-claim cannot interleave after the ownership check. */
export async function withRunLease<T>(runId: string, token: string, write: (sql: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const result = await db().begin(async (sql) => {
    const rows = await sql`select id from runs where id = ${runId} and claim_token = ${token} and status = 'running' for update`;
    if (!rows.length) throw new LeaseLostError();
    return await write(sql);
  });
  return result as T;
}
