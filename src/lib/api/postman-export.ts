/**
 * A Postman collection of the operations a shift saw pass. Each request carries tests for what passed: the status it
 * returned, or the refusal of an anonymous call, and the latency budget. Failing, skipped and data-changing operations
 * are left out, so the collection never records a bug as expected behaviour. Pure: the route supplies the rows.
 */
import { AUTH_CHECK, LATENCY_BUDGET_MS, type ApiCheck } from "./checks";

const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
/** Reads only: a write's body and state are not kept, so replaying it would not reproduce what passed. */
const EXPORTED_METHODS = new Set(["GET", "HEAD"]);

export interface ExportRow {
  method: string;
  /** Path and query as the shift requested them, e.g. "/api/products/5". */
  path: string;
  statusCode: number | null;
  checks: ApiCheck[];
}

export interface PostmanCollection {
  info: { name: string; description: string; schema: string };
  item: PostmanItem[];
}

interface PostmanItem {
  name: string;
  request: {
    method: string;
    header: never[];
    url: { raw: string; protocol: string; host: string[]; path: string[]; query: { key: string; value: string }[] };
  };
  event: { listen: "test"; script: { type: "text/javascript"; exec: string[] } }[];
}

/** Tests for one passing operation. Only numbers from the shift are written into the script, never its text. */
function testsFor(row: ExportRow, status: number): string[] {
  const refusesAnonymous = row.checks.some((check) => check.name === AUTH_CHECK && check.passed);
  const statusTest = refusesAnonymous
    ? `pm.test("Refuses calls without credentials", function () { pm.expect(pm.response.code).to.be.oneOf([401, 403]); });`
    : `pm.test("Returns HTTP ${status}", function () { pm.response.to.have.status(${status}); });`;
  return [
    statusTest,
    `pm.test("Responds within ${LATENCY_BUDGET_MS} ms", function () { pm.expect(pm.response.responseTime).to.be.below(${LATENCY_BUDGET_MS}); });`,
  ];
}

/** Whether a row can be replayed as a test: a read that passed every check, with a status the shift recorded. */
function exportable(row: ExportRow): row is ExportRow & { statusCode: number } {
  return (
    EXPORTED_METHODS.has(row.method) &&
    Number.isInteger(row.statusCode) &&
    row.statusCode !== null &&
    row.statusCode >= 100 &&
    row.statusCode <= 599 &&
    row.checks.length > 0 &&
    row.checks.every((check) => check.passed)
  );
}

function itemFor(row: ExportRow & { statusCode: number }, origin: URL): PostmanItem {
  const url = new URL(row.path, origin);
  return {
    name: `${row.method} ${row.path}`,
    request: {
      method: row.method,
      header: [],
      url: {
        raw: url.href,
        protocol: origin.protocol.replace(/:$/, ""),
        host: [origin.hostname],
        path: url.pathname.split("/").filter((segment) => segment.length > 0),
        query: [...url.searchParams].map(([key, value]) => ({ key, value })),
      },
    },
    event: [{ listen: "test", script: { type: "text/javascript", exec: testsFor(row, row.statusCode) } }],
  };
}

export function buildPostmanCollection(input: { host: string; origin: URL; exportedAt: Date; rows: ExportRow[] }): PostmanCollection {
  return {
    info: {
      name: `TestShift API checks: ${input.host}`,
      description: `Exported from a TestShift shift on ${input.exportedAt.toISOString().slice(0, 10)}. Each request is an operation that passed, with tests for the status and latency seen then. Failing, skipped and data-changing operations are not included.`,
      schema: SCHEMA,
    },
    item: input.rows.filter(exportable).map((row) => itemFor(row, input.origin)),
  };
}
