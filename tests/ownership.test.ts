import assert from "node:assert/strict";
import { test } from "node:test";

import { checkOwnership, dnsRecordName, dnsRecordValue, fileMatches, txtRecordsMatch, type OwnershipLookups } from "../src/lib/ownership";

const TOKEN = "abcDEF123_-token-with-enough-length-1234";

const noDns = async (): Promise<string[][]> => [];
const noFile = async () => ({ status: 404, contentType: "text/plain", body: "", latencyMs: 1, truncated: false, headers: {} });

function lookups(overrides: Partial<OwnershipLookups>): OwnershipLookups {
  return { resolveTxt: noDns, fetchFile: noFile, ...overrides };
}

test("DNS record name and value follow the published format", () => {
  assert.equal(dnsRecordName("shop.example.com"), "_testshift-verify.shop.example.com");
  assert.equal(dnsRecordName("203.0.113.7"), null, "IP addresses have no DNS name");
  assert.equal(dnsRecordValue(TOKEN), `testshift-verify=${TOKEN}`);
});

test("TXT records match when their chunks join to the expected value", () => {
  assert.equal(txtRecordsMatch([["testshift-verify=", TOKEN]], TOKEN), true);
  assert.equal(txtRecordsMatch([["testshift-verify=wrong"]], TOKEN), false);
  assert.equal(txtRecordsMatch([], TOKEN), false);
});

test("the published file must contain only the token, ignoring surrounding whitespace", () => {
  assert.equal(fileMatches(`${TOKEN}\n`, TOKEN), true);
  assert.equal(fileMatches(`<html>${TOKEN}</html>`, TOKEN), false);
});

test("checkOwnership: a matching DNS record verifies by DNS, and the file is not needed", async () => {
  let fileRequested = false;
  const method = await checkOwnership(
    "shop.example.com",
    TOKEN,
    lookups({
      resolveTxt: async (name) => {
        assert.equal(name, "_testshift-verify.shop.example.com");
        return [[dnsRecordValue(TOKEN)]];
      },
      fetchFile: async () => {
        fileRequested = true;
        return noFile();
      },
    }),
  );
  assert.equal(method, "dns");
  assert.equal(fileRequested, false);
});

test("checkOwnership: falls back to the file on the site when DNS has nothing", async () => {
  let requested = "";
  const method = await checkOwnership(
    "shop.example.com",
    TOKEN,
    lookups({
      fetchFile: async (url) => {
        requested = url.href;
        return { status: 200, contentType: "text/plain", body: TOKEN, latencyMs: 1, truncated: false, headers: {} };
      },
    }),
  );
  assert.equal(method, "file");
  assert.equal(requested, "https://shop.example.com/.well-known/testshift-verify.txt");
});

test("checkOwnership: failed lookups and wrong values are never treated as verified", async () => {
  const method = await checkOwnership(
    "shop.example.com",
    TOKEN,
    lookups({
      resolveTxt: async () => {
        throw new Error("ENOTFOUND");
      },
      fetchFile: async () => {
        throw new Error("connection refused");
      },
    }),
  );
  assert.equal(method, null);

  const wrongFile = await checkOwnership(
    "shop.example.com",
    TOKEN,
    lookups({ fetchFile: async () => ({ status: 200, contentType: "text/plain", body: "someone-else", latencyMs: 1, truncated: false, headers: {} }) }),
  );
  assert.equal(wrongFile, null);
});

test("checkOwnership: a redirect or an oversized file is not accepted", async () => {
  const redirect = await checkOwnership(
    "shop.example.com",
    TOKEN,
    lookups({ fetchFile: async () => ({ status: 302, contentType: "", body: TOKEN, latencyMs: 1, truncated: false, headers: {} }) }),
  );
  assert.equal(redirect, null);

  const huge = await checkOwnership(
    "shop.example.com",
    TOKEN,
    lookups({ fetchFile: async () => ({ status: 200, contentType: "text/plain", body: TOKEN, latencyMs: 1, truncated: true, headers: {} }) }),
  );
  assert.equal(huge, null);
});

test("checkOwnership: IP-address hosts skip DNS and still allow the file method", async () => {
  let dnsAsked = false;
  const method = await checkOwnership(
    "203.0.113.7",
    TOKEN,
    lookups({
      resolveTxt: async () => {
        dnsAsked = true;
        return [];
      },
      fetchFile: async () => ({ status: 200, contentType: "text/plain", body: TOKEN, latencyMs: 1, truncated: false, headers: {} }),
    }),
  );
  assert.equal(dnsAsked, false);
  assert.equal(method, "file");
});
