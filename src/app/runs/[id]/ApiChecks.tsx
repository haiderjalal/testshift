import type { ReactElement } from "react";

import { AUTH_CHECK, type ApiCheck, type CheckSeverity } from "@/lib/api/checks";
import { PROBE_CHECK } from "@/lib/api/probes";
import type { SpecFinding } from "@/lib/api/review";
import { latencySeverity, type LatencySummary } from "@/lib/performance";

import { ReportPill } from "./ReportPill";

export interface ApiCheckRow {
  id: string;
  method: string;
  path: string;
  status_code: number | null;
  latency_ms: number | null;
  latency_p95_ms: number | null;
  chained_from: string | null;
  skipped_reason: string | null;
  passed: boolean | null;
  severity: CheckSeverity | null;
  checks: ApiCheck[];
}

interface ApiChecksProps {
  runId: string;
  rows: ApiCheckRow[];
  specUrl: string | null;
  latency: LatencySummary | null;
  findings: SpecFinding[];
}

const SEVERITY_COLOR: Record<CheckSeverity, string> = {
  critical: "text-fail",
  major: "text-marker",
  minor: "text-hold",
};

/** Checks that passed and are worth a note in the table: they say what was ruled out, not just that nothing failed. */
const NOTED_PASSES = [AUTH_CHECK, PROBE_CHECK];
const SHOWN_FINDINGS = 25;

const NOT_FOUND_NOTE =
  "No OpenAPI or Swagger description was found (JSON or YAML, at the usual paths), and no Postman requests were supplied, so no API endpoints were tested.";

export function ApiChecks({ runId, rows, specUrl, latency, findings }: ApiChecksProps): ReactElement {
  const tested = rows.filter((r) => r.passed !== null);
  const passed = tested.filter((r) => r.passed).length;
  const skipped = rows.length - tested.length;
  const exportable = rows.filter((r) => r.passed === true && (r.method === "GET" || r.method === "HEAD")).length;

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
        <p className="glass rounded-2xl p-6 text-graphite">{NOT_FOUND_NOTE}</p>
      ) : (
        <>
          {latency && <LatencyLine latency={latency} />}
          <p className="text-graphite">
            <span className="text-pass">{passed} passed</span> · <span className="text-fail">{tested.length - passed} failed</span> ·{" "}
            {skipped} skipped. Skipped operations were not sent: they change data, need an example value, or ran out of time. A skipped operation is not a pass.
          </p>
          {exportable > 0 && (
            <p className="text-sm text-graphite">
              <a href={`/runs/${runId}/postman`} className="text-ink underline underline-offset-4 hover:text-dev">
                Download the {exportable === 1 ? "passing request" : `${exportable} passing requests`} as a Postman collection
              </a>
              . Each request asserts the status and latency seen in this shift, so Postman or Newman can run it again.
            </p>
          )}
          {/* Scrolls sideways inside its own box on phones, so the page itself never overflows. */}
          <div className="glass overflow-x-auto rounded-2xl" tabIndex={0}>
            <table aria-labelledby="api-heading" className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-rule font-mono text-xs tracking-widest text-graphite uppercase">
                  <th scope="col" className="px-5 py-3 font-medium">
                    Operation
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Result
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-rule px-2 py-0.5 font-mono text-xs">{row.method}</span>
                        <span className="min-w-0 break-all font-mono text-sm">{row.path}</span>
                      </div>
                      {row.chained_from && <p className="mt-2 text-xs text-graphite">value taken from {row.chained_from}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge row={row} />
                    </td>
                    <td className="px-5 py-4">
                      {row.skipped_reason && <p className="text-graphite">Skipped: {row.skipped_reason}</p>}
                      {row.passed === false && row.checks.filter((c) => !c.passed).length > 0 && (
                        <ul className="space-y-1.5">
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
                      {row.checks
                        .filter((c) => c.passed && NOTED_PASSES.includes(c.name))
                        .map((c) => (
                          <p key={c.name} className="mt-1.5 text-xs text-graphite">
                            <span className="text-pass">✓</span> {c.name}: {c.detail}
                          </p>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {findings.length > 0 && <SpecReview findings={findings} />}
    </section>
  );
}

function SpecReview({ findings }: { findings: SpecFinding[] }): ReactElement {
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold tracking-tight">Spec review</h3>
      <p className="text-graphite">
        {warnings} {warnings === 1 ? "warning" : "warnings"} · {findings.length - warnings} suggestions. These describe the API
        documentation and the calls the page makes. They do not change any result above.
      </p>
      <ul className="glass divide-y divide-rule rounded-2xl">
        {findings.slice(0, SHOWN_FINDINGS).map((finding, index) => (
          <li key={`${finding.rule}-${index}`} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-baseline sm:gap-4">
            <span className={`shrink-0 text-xs font-medium ${finding.severity === "warning" ? "text-hold" : "text-graphite"}`}>
              {finding.severity === "warning" ? "Warning" : "Suggestion"}
              {finding.source === "browser" ? " · browser" : ""}
            </span>
            <div className="min-w-0">
              <p>{finding.message}</p>
              {finding.location && <p className="mt-1 font-mono text-xs break-all text-graphite">{finding.location}</p>}
            </div>
          </li>
        ))}
      </ul>
      {findings.length > SHOWN_FINDINGS && (
        <p className="text-sm text-graphite">{findings.length - SHOWN_FINDINGS} more findings are not shown.</p>
      )}
    </div>
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
    return <ReportPill tone="neutral">not run</ReportPill>;
  }
  const detail = [
    row.status_code ? `HTTP ${row.status_code}` : null,
    row.latency_ms !== null ? `p50 ${row.latency_ms} ms` : null,
    row.latency_p95_ms !== null ? `p95 ${row.latency_p95_ms} ms` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col items-start gap-1.5">
      <ReportPill tone={row.passed ? "pass" : "fail"}>{row.passed ? "✓ passed" : "✗ failed"}</ReportPill>
      {detail && <span className="font-mono text-xs text-graphite">{detail}</span>}
    </div>
  );
}
