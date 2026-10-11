import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { chromium, type Browser } from "playwright";
import postgres from "postgres";

const db = new PGlite();
let socket: PGLiteSocketServer;
let sql: postgres.Sql;
let model: Server;
let browser: Browser;
let modelCalls = 0;
let modelReply: () => unknown = () => ({});
let documents: typeof import("../worker/documents");
let store: typeof import("../src/lib/documents/store");
let limits: typeof import("../src/lib/documents/limits");

const SITE: Record<string, string> = {
  "/": `<!doctype html><html lang="en"><head><title>Shop</title></head><body>
    <h1>Welcome to the shop</h1><img src="/logo.png"><nav><a href="/pricing">Pricing</a> <a href="/contact">Contact</a></nav>
    <form><label>Work email <input type="email" required></label><button type="button">Subscribe</button></form>
    </body></html>`,
  "/pricing": `<!doctype html><html lang="en"><head><title>Pricing</title></head><body>
    <h1>Pricing plans</h1><nav><a href="/">Home</a></nav>
    <form><label>Seats <input type="number" name="seats" min="1" max="10"></label><button type="button">Start trial</button></form>
    </body></html>`,
  "/contact": `<!doctype html><html lang="en"><head><title>Contact</title></head><body>
    <h1>Contact us</h1><nav><a href="/">Home</a></nav>
    <form><label>Your name <input name="name" required maxlength="40"></label>
    <label>Message <textarea name="message" maxlength="200"></textarea></label><button type="button">Send</button></form>
    </body></html>`,
};

/** A browser whose every page answers from SITE (or with `status` for every page), so nothing leaves the test. */
function siteBrowser(pages: Record<string, string>, status = 200): Browser {
  return new Proxy(browser, {
    get(target, property) {
      if (property !== "newContext") return Reflect.get(target, property);
      return async (...args: Parameters<Browser["newContext"]>) => {
        const context = await target.newContext(...args);
        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await newPage();
          await page.route("**/*", (route) => {
            const { pathname } = new URL(route.request().url());
            if (status !== 200) return route.fulfill({ status, contentType: "text/html", body: "<h1>Error</h1>" });
            const body = pages[pathname];
            if (body === undefined) return route.fulfill({ status: 404, contentType: "text/html", body: "<h1>Not found</h1>" });
            return route.fulfill({ status: 200, contentType: "text/html", body });
          });
          return page;
        };
        return context;
      };
    },
  });
}

const scenarioReply = () => ({
  id: "msg_documents",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  content: [
    {
      type: "text",
      text: JSON.stringify({
        cases: [
          {
            feature: "Contact form",
            title: "Send a message with every field filled in",
            type: "functional",
            priority: "high",
            page_url: "https://shop.example.com/contact",
            preconditions: "",
            test_data: "Name: Test User. Message: Hello.",
            steps: ["Open the contact page.", "Fill in the name and message with test data.", "Press Send."],
            expected: "A confirmation message appears and the form is cleared.",
          },
          {
            feature: "Contact form",
            title: "Short",
            type: "functional",
            priority: "low",
            page_url: "https://shop.example.com/contact",
            preconditions: "",
            test_data: "",
            steps: ["Open it.", "Check it."],
            expected: "Fine.",
          },
        ],
      }),
    },
  ],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1200, output_tokens: 600 },
});

before(async () => {
  for (const file of (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  socket = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  await socket.start();
  sql = postgres(`postgres://postgres:postgres@${socket.getServerConn()}/postgres`, { prepare: false, max: 1 });
  Object.assign(globalThis, { sql });

  model = createServer(async (request, response) => {
    request.resume();
    modelCalls++;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(modelReply()));
  });
  await new Promise<void>((resolve) => model.listen(0, "127.0.0.1", resolve));
  process.env.ANTHROPIC_API_KEY = "test-key-no-external-access";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(model.address() as AddressInfo).port}`;
  // Imported after the environment is set: the model client reads it when it is created.
  documents = await import("../worker/documents");
  store = await import("../src/lib/documents/store");
  limits = await import("../src/lib/documents/limits");
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await sql?.end();
  await socket?.stop();
  await db.close();
  model?.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
});

async function queue(url: string, extra: Record<string, string> = {}): Promise<string> {
  const id = crypto.randomUUID();
  await sql`insert into test_documents (id, url, host, site_key, email, notes, visitor)
    values (${id}, ${url}, ${new URL(url).hostname}, 'example.com', 'owner@example.com', ${extra.notes ?? ""}, ${extra.visitor ?? "visitor-main"})`;
  return id;
}

test("a queued request becomes a document: cases, a PDF and a Word file, one scenario call, and its cost on record", async () => {
  const id = await queue("https://shop.example.com/", { notes: "Focus on the contact form." });
  modelReply = scenarioReply;
  const job = await documents.claimDocument();
  assert.ok(job, "the queued document is claimed");
  assert.equal(job.id, id);
  await documents.runDocumentJob(job, siteBrowser(SITE));

  const [row] = await sql<{ status: string; page_count: number; case_count: number; ai_case_count: number; summary: { total: number } }[]>`
    select status, page_count, case_count, ai_case_count, summary from test_documents where id = ${id}`;
  assert.equal(row.status, "completed");
  assert.equal(row.page_count, 3, "the three pages of the fixture site were crawled");
  assert.ok(row.case_count >= 25, `the document holds many cases, found ${row.case_count}`);
  assert.equal(row.ai_case_count, 1, "the valid scenario is kept and the short one is refused");
  assert.equal(row.summary.total, row.case_count);
  assert.equal(modelCalls, 1, "the three pages fit in one scenario batch");

  const cases = await sql<{ code: string; source: string; title: string }[]>`
    select code, source, title from test_document_cases where document_id = ${id} order by seq`;
  assert.equal(cases[0].code, "TC-001");
  assert.equal(cases.at(-1)?.code, `TC-${String(cases.length).padStart(3, "0")}`, "codes run in reading order without gaps");
  assert.ok(cases.some((c) => c.source === "crawl"));
  assert.ok(cases.some((c) => c.source === "scan"), "the accessibility scan contributes cases");
  assert.ok(cases.some((c) => c.source === "ai" && c.title === "Send a message with every field filled in"));
  assert.ok(cases.some((c) => c.title === 'Enter 11 in "Seats", just above the maximum'), "the number field's limit is tested");

  const files = await sql<{ format: string; bytes: number; content: Buffer }[]>`
    select format, bytes, content from test_document_files where document_id = ${id} order by format`;
  assert.deepEqual(files.map((f) => f.format), ["docx", "pdf"]);
  assert.equal(files[1].content.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(files[0].content.subarray(0, 2).toString("latin1"), "PK", "the Word file is a zip package");
  assert.ok(files.every((f) => f.bytes === f.content.byteLength));

  const [usage] = await sql<{ purpose: string; model: string; cost: number; calls: number }[]>`
    select purpose, model, sum(cost_usd)::float8 as cost, count(*)::int as calls from ai_usage
    where document_id = ${id} group by purpose, model`;
  assert.equal(usage.purpose, "document", "document spend is attributed to documents, not to a run");
  assert.equal(usage.model, "claude-sonnet-5-5");
  assert.equal(usage.calls, 1);
  assert.ok(usage.cost > 0);
});

test("a file is served only once its document is completed", async () => {
  const id = await queue("https://shop.example.com/", { visitor: "visitor-download" });
  assert.equal(await store.getDocumentFile(id, "pdf"), undefined, "a queued document has no file yet");
  const job = await documents.claimDocument();
  assert.ok(job);
  assert.equal(job.id, id);
  await documents.runDocumentJob(job, siteBrowser(SITE));
  const file = await store.getDocumentFile(id, "pdf");
  assert.ok(file, "a completed document's PDF is available");
  assert.equal(file.host, "shop.example.com");
  assert.equal(file.content.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(await store.getDocumentFile(id, "exe" as "pdf"), undefined, "only the two formats are served");
});

test("a site that cannot be loaded fails with a message the person can read, and no cases are written", async () => {
  const id = await queue("https://shop.example.com/", { visitor: "visitor-broken" });
  const job = await documents.claimDocument();
  assert.ok(job);
  await assert.rejects(documents.runDocumentJob(job, siteBrowser(SITE, 500)), (error: Error) => {
    assert.ok(error instanceof documents.DocumentError);
    assert.match(error.message, /could not load any page of shop\.example\.com/);
    return true;
  });
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from test_document_cases where document_id = ${id}`;
  assert.equal(count, 0);
});

test("the AI cost limit switches scenario drafting off without stopping the document", async () => {
  const id = await queue("https://shop.example.com/", { visitor: "visitor-budget" });
  const previous = process.env.DOCUMENT_MAX_AI_USD;
  process.env.DOCUMENT_MAX_AI_USD = "0";
  try {
    const callsBefore = modelCalls;
    const job = await documents.claimDocument();
    assert.ok(job);
    await documents.runDocumentJob(job, siteBrowser(SITE));
    assert.equal(modelCalls, callsBefore, "no call is made when the budget is zero");
    const [row] = await sql<{ status: string; ai_case_count: number }[]>`select status, ai_case_count from test_documents where id = ${id}`;
    assert.equal(row.status, "completed");
    assert.equal(row.ai_case_count, 0);
    const [files] = await sql<{ count: number }[]>`
      select count(*)::int as count from test_document_files where document_id = ${id}`;
    assert.equal(files.count, 2, "the PDF and Word files are still written when scenario drafting is skipped");
    const [sources] = await sql<{ crawl: number }[]>`
      select count(*) filter (where source = 'crawl')::int as crawl from test_document_cases where document_id = ${id}`;
    assert.ok(sources.crawl > 0, "the rule-based cases are still written");
  } finally {
    if (previous === undefined) delete process.env.DOCUMENT_MAX_AI_USD;
    else process.env.DOCUMENT_MAX_AI_USD = previous;
  }
});

test("requests are limited per visitor per day, and the limit is checked before a row is written", async () => {
  // Each request is for a different site, so only the visitor's own daily allowance can refuse one.
  for (let i = 0; i < 3; i++) {
    const host = `visitor-limit-${i}.example.com`;
    const result = await store.createDocumentRequest({ url: `https://${host}/`, host, siteKey: host, email: "x@example.com", notes: "", visitor: "busy-visitor" });
    assert.ok("id" in result, `request ${i + 1} is allowed`);
  }
  const refused = await store.createDocumentRequest({ url: "https://visitor-limit-4.example.com/", host: "visitor-limit-4.example.com", siteKey: "visitor-limit-4.example.com", email: "x@example.com", notes: "", visitor: "busy-visitor" });
  assert.deepEqual(refused, { limit: "visitor" });
  // These rows were only ever counted, never worked on: close them so no later test claims them.
  await sql`update test_documents set status = 'failed', error = 'test cleanup' where visitor = 'busy-visitor'`;
});

test("the scope notes say what was limited, and say nothing that did not happen", () => {
  const base = { host: "shop.example.com", limits: limits.documentLimits({}), scanned: 2, aiCases: 0, aiBatches: 0 };
  const loaded = { url: "https://shop.example.com/", title: "Home", status: 200, loadMs: 300, outline: "", issues: [] };
  const limited = documents.scopeNotes({ ...base, pages: [{ ...loaded, url: "https://shop.example.com/login", status: 401 }], aiStopped: true, dropped: 5 });
  assert.ok(limited.some((note) => /AI cost limit/.test(note)));
  assert.ok(limited.some((note) => /need a login/.test(note)));
  assert.ok(limited.some((note) => /5 lower-priority case\(s\) were left out/.test(note)));
  const complete = documents.scopeNotes({ ...base, pages: [loaded], aiStopped: false, dropped: 0 });
  assert.equal(complete.some((note) => /AI cost limit|left out|need a login/.test(note)), false);
  assert.ok(complete.some((note) => /Nothing in this document was run against the site/.test(note)));
});

test("a document whose site cannot be reached is marked failed with that message, through the real worker entry point", async () => {
  const id = await queue("https://no-such-site.invalid/", { visitor: "visitor-unreachable" });
  const handled = await documents.processDocumentRequest();
  assert.equal(handled, true);
  const [row] = await sql<{ status: string; error: string }[]>`select status, error from test_documents where id = ${id}`;
  assert.equal(row.status, "failed");
  assert.match(row.error, /could not load any page/);
});

test("invalid limits are refused rather than silently replaced", () => {
  assert.throws(() => limits.documentLimits({ DOCUMENT_MAX_CASES: "0" }), /Invalid DOCUMENT_MAX_CASES/);
  assert.throws(() => limits.documentLimits({ DOCUMENT_MAX_AI_USD: "lots" }), /Invalid DOCUMENT_MAX_AI_USD/);
  assert.equal(limits.documentLimits({}).maxCases, 300, "defaults apply when nothing is set");
});
