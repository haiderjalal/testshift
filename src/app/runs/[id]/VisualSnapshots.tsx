import Image from "next/image";

import { approveVisualSnapshot } from "./visual/actions";

export interface VisualSnapshotRow {
  id: string;
  path: string;
  viewport: "desktop" | "mobile";
  status: "no_baseline" | "match" | "changed" | "size_changed";
  changed_ratio: number | null;
  width: number;
  height: number;
  has_baseline: boolean;
  has_diff: boolean;
}

const STATUS_TEXT: Record<VisualSnapshotRow["status"], { label: string; className: string }> = {
  match: { label: "Matches the approved screenshot", className: "text-pass" },
  changed: { label: "Changed since the approved screenshot", className: "text-marker" },
  size_changed: { label: "Page height changed", className: "text-marker" },
  no_baseline: { label: "No approved screenshot yet", className: "text-graphite" },
};

const CALL_TO_ACTION: Record<VisualSnapshotRow["status"], string> = {
  match: "",
  changed: "Approve the new look",
  size_changed: "Approve the new layout",
  no_baseline: "Approve as baseline",
};

export function VisualSnapshots({ runId, rows }: { runId: string; rows: VisualSnapshotRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="visual-heading" className="space-y-5">
      <h2 id="visual-heading" className="font-display text-xl font-semibold tracking-tight">
        Visual comparison
      </h2>
      <p className="text-graphite">
        Each page is compared pixel by pixel with its approved screenshot. Approve a screenshot to make it the reference for future shifts. Elements marked
        <span className="font-mono text-ink"> data-testshift-ignore </span>
        are hidden from the comparison.
      </p>
      <ul className="grid gap-6 md:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id} className="glass space-y-4 rounded-2xl p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-mono text-sm break-all">{row.path}</p>
              <p className="text-xs text-graphite">{row.viewport}</p>
            </div>
            <p className={`text-sm font-medium ${STATUS_TEXT[row.status].className}`}>
              {STATUS_TEXT[row.status].label}
              {row.changed_ratio !== null && row.status !== "match" && row.status !== "size_changed"
                ? ` · ${(row.changed_ratio * 100).toFixed(2)}% of pixels`
                : ""}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {row.has_baseline && (
                <Figure label="Approved" src={`/runs/${runId}/visual/${row.id}?kind=baseline`} width={row.width} height={row.height} />
              )}
              <Figure label="This shift" src={`/runs/${runId}/visual/${row.id}?kind=current`} width={row.width} height={row.height} />
              {row.has_diff && (
                <Figure label="Differences" src={`/runs/${runId}/visual/${row.id}?kind=diff`} width={row.width} height={row.height} />
              )}
            </div>
            {row.status !== "match" && (
              <form action={approveVisualSnapshot}>
                <input type="hidden" name="runId" value={runId} />
                <input type="hidden" name="snapshotId" value={row.id} />
                <button className="btn-primary h-10">{CALL_TO_ACTION[row.status]}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Figure({ label, src, width, height }: { label: string; src: string; width: number; height: number }) {
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-xs text-graphite">{label}</figcaption>
      <Image src={src} alt={`${label} screenshot`} width={width} height={height} unoptimized className="w-full rounded-lg border border-rule" />
    </figure>
  );
}
