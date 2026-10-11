import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { after, before, test } from "node:test";

import { chromium, type Browser } from "playwright";

import { buildModel, type DocumentCase } from "../src/lib/documents/model";
import { renderDocx } from "../src/lib/documents/render-docx";
import { esc, renderDocumentHtml } from "../src/lib/documents/render-html";
import { renderPdf } from "../worker/document-pdf";

const HOSTILE = `<img src="https://tracker.example.net/p.gif" onerror="alert(1)"><script>alert("x")</script> & "quotes"`;

const hostileModel = () => {
  const c: DocumentCase = {
    feature: `Checkout ${HOSTILE}`,
    title: `Use the ${HOSTILE} field`,
    type: "negative",
    priority: "high",
    source: "crawl",
    pageUrl: "https://shop.example.com/pay?next=<b>",
    preconditions: "",
    testData: "",
    steps: [`Type ${HOSTILE} into the box.`, "Submit."],
    expected: `The page shows ${HOSTILE}.`,
    observed: "",
  };
  return buildModel({
    siteUrl: "https://shop.example.com/",
    generatedAt: new Date("2026-10-11T12:00:00Z"),
    pages: [{ url: "https://shop.example.com/", title: HOSTILE, status: 200 }],
    cases: [c, { ...c, title: "Use & < > quotes", feature: "Checkout", steps: ["Open it.", "Check it."], expected: "Fine." }],
    observations: [`/: ${HOSTILE}`],
    notes: ["Scope note with <b>markup</b>."],
  });
};

/** Reads every file of a zip archive, using the central directory. Enough for the files a Word document contains. */
function unzip(buffer: Buffer): Map<string, Buffer> {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, "the archive ends with its directory record");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "a central directory entry");
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(dataStart, dataStart + compressed);
    files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

let browser: Browser;
before(async () => {
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
});

test("every value from the customer's site is escaped in the HTML, so page text cannot add markup", () => {
  const html = renderDocumentHtml(hostileModel());
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img src="https:\/\/tracker/i);
  assert.doesNotMatch(html, /<b>markup/i);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.equal(esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("the HTML lists every case once, under its reference, with its expected result", () => {
  const html = renderDocumentHtml(hostileModel());
  assert.equal(html.match(/TC-001/g)?.length, 2, "the reference is shown in the heading and the summary of the case");
  assert.match(html, /TC-002/);
  assert.match(html, /Expected result/);
  assert.match(html, /Scope and limits/);
});

test("the Word file is a zip package whose text is escaped, and it names every section", async () => {
  const buffer = await renderDocx(hostileModel());
  assert.equal(buffer.subarray(0, 4).toString("hex"), "504b0304", "a zip local file header");
  const files = unzip(buffer);
  assert.ok(files.has("[Content_Types].xml"));
  assert.ok(files.has("word/document.xml"));
  const xml = files.get("word/document.xml")?.toString("utf8") ?? "";
  assert.match(xml, /TC-001/);
  assert.match(xml, /Use &amp; &lt; &gt; quotes/, "characters are escaped in the XML");
  assert.doesNotMatch(xml, /<script/i);
  assert.match(xml, /Test cases for shop\.example\.com/);
});

test("the PDF is printed by Chromium with scripts off and no network, and is a real PDF", async () => {
  const pdf = await renderPdf(browser, renderDocumentHtml(hostileModel()));
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(pdf.byteLength > 2_000, "the document has content, not just a header");
  assert.match(pdf.toString("latin1"), /\/Type \/Page\b/);
});
