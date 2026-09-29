import { readdir } from "node:fs/promises";

import { db } from "@/lib/db";
import { log } from "@/lib/log";

const DIR = "supabase/migrations";

/** Applies every SQL file in supabase/migrations in order. The files are written to be safe to re-run. */
async function main(): Promise<void> {
  for (const file of (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort()) {
    await db().file(`${DIR}/${file}`);
    log("info", "Applied migration", { file });
  }
  await db().end();
}

void main();
