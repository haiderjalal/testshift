import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { digest, sealToken } from "../src/lib/github/crypto";

async function main() {
  const db = await PGlite.create();
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  for (const file of (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  const id = "11111111-1111-4111-8111-111111111111";
  // Explicit fixture estimates, not defaults or production pricing claims.
  await db.exec("insert into beta_plan_prices (plan,estimated_token_hour_cents) values ('junior',100),('senior',200)");
  await db.query("insert into runs (id,url,email,plan,minutes,status,report,strategy) values ($1,'https://8.8.8.8/','fixture@example.com','junior',60,'completed',$2,$3)",
    [id, JSON.stringify({ score: 100, summary: "Fixture: no checks completed.", strengths: [], recommendations: [] }),
      JSON.stringify({ summary: "Fixture", features: [{ id: "F1", name: "Checkout", url: "https://8.8.8.8/", risk: "high", what_to_test: "Checkout" }] })]);
  const socket = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1", maxConnections: 10 });
  await db.exec("insert into runs (id,url,email,plan,minutes,status) values ('33333333-3333-4333-8333-333333333333','https://8.8.4.4/','other-fixture@example.com','junior',60,'completed')");
  await db.exec("insert into test_cases (id,run_id,seq,title,category,priority,start_url,steps,expected,status,screenshot) values ('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333',1,'Screenshot fixture','smoke','low','https://8.8.4.4/','[]','Fixture','blocked',decode('ffd8ffd9','hex'))");
  await socket.start();
  await db.exec("insert into github_users (id,login) values (901,'fixture-owner'),(902,'fixture-other')");
  for (const identity of [901, 902, 903, 904]) {
    const user = identity >= 903 ? 901 : identity;
    await db.query("insert into github_sessions (token_hash,user_id,encrypted_token,expires_at) values ($1,$2,$3,now()+interval '1 hour')",
      [digest(String(identity).padEnd(43, "x")), user, sealToken(`fixture-customer-token-${user}`, String(user))]);
  }
  const connection = "99999999-9999-4999-8999-999999999999";
  await db.query("insert into github_connections (id,user_id,installation_id,repository_id,full_name) values ($1,901,905,907,'fixture-owner/project')", [connection]);
  await db.query("insert into github_jobs (id,connection_id,workflow_run_id,run_attempt,head_sha,status,conclusion,report) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$1,910,1,$2,'completed','failure',$3)",
    [connection, "a".repeat(40), JSON.stringify({ scope: "Fixture verified CI metadata", conclusion: "failure", jobs: [{ id: 911, name: "Fixture integration suite", status: "completed", conclusion: "failure", steps: [{ name: "Synthetic rollback check", number: 1, status: "completed", conclusion: "failure" }] }], untested: ["Production data is outside scope"] })]);
  const fixtureKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const app = spawn(process.execPath, ["--import", "tsx", "--import", "./tests/github.fixture.ts", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3107"], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, DATABASE_URL: `postgres://postgres:postgres@${socket.getServerConn()}/postgres`, DATABASE_POOL_SIZE: "1",
      APP_URL: "http://127.0.0.1:3107", ADMIN_PASSWORD: "test-only-password-12345", STRIPE_ENABLED: "0", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "",
      RESEND_API_KEY: "", OWNER_EMAIL: "", ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", MAX_TRIALS_PER_DAY: "10",
      TRUST_PROXY_HEADERS: "1", VERCEL: "0", GITHUB_APP_ID: "900", GITHUB_APP_SLUG: "fixture-testshift", GITHUB_CLIENT_ID: "fixture-client",
      GITHUB_CLIENT_SECRET: "fixture-client-secret", GITHUB_APP_PRIVATE_KEY: fixtureKey, GITHUB_GENERATION_ENABLED: "1",
      GITHUB_WEBHOOK_SECRET: "fixture-webhook-secret-with-32-characters", GITHUB_TOKEN_ENCRYPTION_KEY: process.env.GITHUB_TOKEN_ENCRYPTION_KEY },
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
