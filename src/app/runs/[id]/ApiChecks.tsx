import type { ApiCheck, CheckSeverity } from "@/lib/api/checks";
import { latencySeverity, type LatencySummary } from "@/lib/performance";

export interface ApiCheckRow {
  id: string;
  method: string;
  path: string;
  status_code: number | null;
  latency_ms: number | null;
  latency_p95_ms: number | null;
  skipped_reason: string | null;
  passed: boolean | null;
  severity: CheckSeverity | null;
  checks: ApiCheck[];
}

const SEVERITY_COLOR: Record<CheckSeverity, string> = {
  critical: "text-fail",
  major: "text-marker",
  minor: "text-hold",
};

const NOT_FOUND_NOTE =
  "No OpenAPI 3 document (JSON) was found at /openapi.json, /swagger.json, /v3/api-docs, /api-docs or /api/openapi.json, so no API endpoints were tested.";

export function ApiChecks({ rows, specUrl, latency }: { rows: ApiCheckRow[]; specUrl: string | null; latency: LatencySummary | null }) {
  const tested = rows.filter((r) => r.passed !== null);
  const passed = tested.filter((r) => r.passed).length;
  const skipped = rows.length - tested.length;

  return (
    <section aria-labelledby="api-heading" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="api-heading" className="font-display text-xl font-semibold tracking-tight">
          API checks
        </h2>
        {specUrl && (
          <p className="font-mono text-xs text-graphite break-all">
            Spec: <span className="text-ink">{specUrl}</span>
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-graphite">{NOT_FOUND_NOTE}</p>
      ) : (
        <>
          {latency && <LatencyLine latency={latency} />}
          <p className="text-graphite">
            <span className="text-pass">{passed} passed</span> · <span className="text-fail">{tested.length - passed} failed</span> ·{" "}
            {skipped} skipped. Skipped operations were not sent: they change data, need an example value, or ran out of time. A skipped operation is not a pass.
          </p>
          <ol className="divide-y divide-rule rounded-2xl border border-rule">
            {rows.map((row) => (
              <li key={row.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md border border-rule px-2 py-0.5 font-mono text-xs">{row.method}</span>
                  <span className="min-w-0 break-all font-mono text-sm">{row.path}</span>
                  <StatusBadge row={row} />
                </div>
                {row.skipped_reason && <p className="mt-2 text-sm text-graphite">Skipped: {row.skipped_reason}</p>}
                {row.passed === false && row.checks.filter((c) => !c.passed).length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {row.checks
                      .filter((c) => !c.passed)
                      .map((c) => (
                        <li key={c.name}>
                          <span className={`font-medium ${c.severity ? SEVERITY_COLOR[c.severity] : ""}`}>
                            {c.severity ?? "issue"} · {c.name}:
                          </span>{" "}
                          <span className="text-graphite">{c.detail}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function LatencyLine({ latency }: { latency: LatencySummary }) {
  const severity = latencySeverity(latency.p95);
  return (
    <p className={`text-sm ${severity ? SEVERITY_COLOR[severity] : "text-graphite"}`}>
      Latency across {latency.samples} requests: p50 {latency.p50} ms, p95 {latency.p95} ms, p99 {latency.p99} ms.
      {severity ? ` p95 is above the ${severity === "major" ? "2" : "1"}-second budget.` : " Within the 1-second budget."}
    </p>
  );
}

function StatusBadge({ row }: { row: ApiCheckRow }) {
  if (row.passed === null) {
    return <span className="text-xs text-graphite">not run</span>;
  }
  const detail = [
    row.status_code ? `HTTP ${row.status_code}` : null,
    row.latency_ms !== null ? `p50 ${row.latency_ms} ms` : null,
    row.latency_p95_ms !== null ? `p95 ${row.latency_p95_ms} ms` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className={`font-mono text-xs ${row.passed ? "text-pass" : "text-fail"}`}>
      {row.passed ? "✓ passed" : "✗ failed"}
      {detail && <span className="text-graphite"> · {detail}</span>}
    </span>
  );
}
