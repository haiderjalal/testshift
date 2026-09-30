import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function main() {
  const db = await PGlite.create();
  for (const file of (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  const id = "11111111-1111-4111-8111-111111111111";
  // Explicit fixture estimates, not defaults or production pricing claims.
  await db.exec("insert into beta_plan_prices (plan,estimated_token_hour_cents) values ('junior',100),('senior',200)");
  await db.query("insert into runs (id,url,email,plan,minutes,status,report,strategy) values ($1,'https://8.8.8.8/','fixture@example.com','junior',60,'completed',$2,$3)",
    [id, JSON.stringify({ score: 100, summary: "Fixture: no checks completed.", strengths: [], recommendations: [] }),
      JSON.stringify({ summary: "Fixture", features: [{ id: "F1", name: "Checkout", url: "https://8.8.8.8/", risk: "high", what_to_test: "Checkout" }] })]);
  const socket = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1", maxConnections: 10 });
  await socket.start();
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3107"], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, DATABASE_URL: `postgres://postgres:postgres@${socket.getServerConn()}/postgres`, DATABASE_POOL_SIZE: "1",
      APP_URL: "http://127.0.0.1:3107", ADMIN_PASSWORD: "test-only-password-12345", STRIPE_ENABLED: "0", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "",
      RESEND_API_KEY: "", OWNER_EMAIL: "", ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", MAX_TRIALS_PER_DAY: "10" },
  });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    app.kill(); await socket.stop(); await db.close();
  };
  process.once("SIGTERM", () => void close());
  process.once("SIGINT", () => void close());
  app.once("exit", () => void close());
}
void main();
