import assert from "node:assert/strict";
import { test } from "node:test";

import { describeFailure, log } from "../src/lib/log";

test("failures are described by our own setup message or a database error code, never by a driver message", () => {
  const ownMessage = "DATABASE_URL is malformed: URL-encode special characters in the password (% → %25).";
  assert.equal(describeFailure(new Error(ownMessage)), ownMessage);
  const missingTable = Object.assign(new Error('relation "test_documents" does not exist'), { code: "42P01" });
  assert.match(describeFailure(missingTable), /migrations are applied/);
  assert.equal(describeFailure(Object.assign(new Error("password authentication failed"), { code: "28P01" })), "error code 28P01");
  // A driver message can contain a connection string, so it is never copied into a log.
  assert.equal(describeFailure(new Error("connect postgres://postgres:postgres@127.0.0.1:5432/postgres failed")), "Error");
  assert.equal(describeFailure("not an error"), "UnknownError");
});

test("a document that could not be read, and a missing Chromium, are each named with what to do", () => {
  const unreadable = new Error("We could not load any page of a.example.com.");
  unreadable.name = "DocumentError";
  assert.equal(describeFailure(unreadable), "the site could not be read, so no test cases were written");
  const missingBrowser = new Error("browserType.launch: Executable doesn't exist at C:\\Users\\example\\chrome.exe");
  assert.match(describeFailure(missingBrowser), /npx\.cmd playwright install chromium/);
  // The path in that message is the driver's, so it does not appear in the description.
  assert.doesNotMatch(describeFailure(missingBrowser), /Users|chrome\.exe/);
});

test("logs keep only the documented keys, and document identifiers are hashed like run identifiers", () => {
  const lines: string[] = [];
  const write = console.log;
  console.log = (line: string) => {
    lines.push(String(line));
  };
  try {
    log("info", "check", { documentId: "00000000-0000-4000-8000-0000000000d1", email: "owner@example.com", notes: "private notes" });
  } finally {
    console.log = write;
  }
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.email, undefined);
  assert.equal(entry.notes, undefined);
  assert.match(entry.documentId, /^[0-9a-f]{16}$/);
  assert.notEqual(entry.documentId, "00000000-0000-4000-8000-0000000000d1");
});
