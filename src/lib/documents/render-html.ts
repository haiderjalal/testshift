/**
 * The document as HTML, printed to PDF by the worker. Every value from the customer's site (titles, link names, field
 * labels, steps) passes through `esc`, so page text can never add markup, scripts or links to the file.
 */
import { SOURCE_LABEL, type DocumentModel, type NumberedCase, type Priority } from "./model";

const ENTITY: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITY[char] ?? char);
}

const STYLE = `
  @page { size: A4; }
  body { font: 10pt/1.45 "Segoe UI", Arial, Helvetica, sans-serif; color: #111827; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 4pt; letter-spacing: -0.2pt; }
  h2 { font-size: 14pt; margin: 20pt 0 8pt; padding-bottom: 3pt; border-bottom: 1px solid #d1d5db; break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 14pt 0 6pt; color: #1e3a8a; break-after: avoid; }
  p { margin: 0 0 6pt; }
  ul { margin: 0 0 8pt; padding-left: 16pt; }
  li { margin-bottom: 3pt; }
  .muted { color: #4b5563; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 8pt; }
  th, td { border: 1px solid #d1d5db; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  td.num { text-align: right; width: 14%; }
  .case { border: 1px solid #d1d5db; border-radius: 4pt; padding: 6pt 9pt 4pt; margin: 0 0 9pt; break-inside: avoid; }
  .case h4 { font-size: 10.5pt; margin: 0 0 3pt; }
  .meta { font-size: 8.5pt; color: #4b5563; margin-bottom: 5pt; }
  .pill { display: inline-block; border-radius: 3pt; padding: 0 5pt; font-weight: 600; color: #ffffff; }
  .high { background: #b91c1c; } .medium { background: #b45309; } .low { background: #4b5563; }
  dl { display: grid; grid-template-columns: 22% 78%; gap: 3pt 8pt; margin: 0; }
  dt { font-weight: 600; color: #374151; }
  dd { margin: 0; }
  dd ol { margin: 0; padding-left: 14pt; }
`;

const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };

function caseHtml(c: NumberedCase): string {
  const rows: [string, string | null][] = [
    ["Page", c.pageUrl],
    ["Preconditions", c.preconditions || null],
    ["Test data", c.testData || null],
    ["Steps", null],
    ["Expected result", c.expected],
    ["Observed in scan", c.observed || null],
  ];
  const body = rows
    .flatMap(([label, value]) => {
      if (label === "Steps") {
        const items = c.steps.map((step) => `<li>${esc(step)}</li>`).join("");
        return [`<dt>${label}</dt><dd><ol>${items}</ol></dd>`];
      }
      return value === null ? [] : [`<dt>${label}</dt><dd>${esc(value)}</dd>`];
    })
    .join("");
  return `<article class="case">
  <h4>${esc(c.code)} · ${esc(c.title)}</h4>
  <p class="meta"><span class="pill ${c.priority}">${PRIORITY_LABEL[c.priority]}</span> ${esc(c.type)} · ${esc(SOURCE_LABEL[c.source])} · ${esc(c.feature)}</p>
  <dl>${body}</dl>
</article>`;
}

/** Cases grouped under their feature, keeping the model's reading order. */
function casesHtml(model: DocumentModel): string {
  const groups = new Map<string, NumberedCase[]>();
  for (const c of model.cases) groups.set(c.feature, [...(groups.get(c.feature) ?? []), c]);
  if (groups.size === 0) return `<p class="muted">No test cases were written for this site.</p>`;
  return [...groups]
    .map(([feature, cases]) => `<h3>${esc(feature)} (${cases.length})</h3>${cases.map(caseHtml).join("\n")}`)
    .join("\n");
}

export function renderDocumentHtml(model: DocumentModel): string {
  const { summary } = model;
  const date = model.generatedAt.toISOString().slice(0, 10);
  const summaryRows: [string, number][] = [
    ["Test cases", summary.total],
    ["High priority", summary.byPriority.high],
    ["Medium priority", summary.byPriority.medium],
    ["Low priority", summary.byPriority.low],
    [SOURCE_LABEL.crawl, summary.bySource.crawl],
    [SOURCE_LABEL.scan, summary.bySource.scan],
    [SOURCE_LABEL.ai, summary.bySource.ai],
    ["Features covered", summary.features],
    ["Pages scanned", model.pages.length],
  ];
  const pageRows = model.pages
    .map((page) => `<tr><td>${esc(page.url)}</td><td class="num">${page.status || "none"}</td><td>${esc(page.title || "No title")}</td></tr>`)
    .join("");
  const observations = model.observations.length
    ? `<ul>${model.observations.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
    : `<p class="muted">The scan recorded no problems on the site's own pages.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Test cases for ${esc(model.host)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>Test cases for ${esc(model.host)}</h1>
<p class="muted">Generated ${esc(date)} from ${esc(model.siteUrl)}</p>

<h2>Summary</h2>
<table>
${summaryRows.map(([label, count]) => `<tr><th>${esc(label)}</th><td class="num">${count}</td></tr>`).join("\n")}
</table>

<h2>How to use this document</h2>
<ul>
<li>Each case has a reference (TC-001), the page to start on, steps to follow and the result to expect.</li>
<li>Crawl rules come from what the automated crawl saw on each page. Accessibility scan cases come from an automated checker. AI-drafted scenarios were written by a model from the crawl, so review them before you rely on them.</li>
<li>Expected results describe what the site showed during the scan, or a standard the browser enforces. Where the intended behavior is unclear, confirm it with the team before you file a defect.</li>
</ul>

<h2>Pages scanned</h2>
<table>
<tr><th>Address</th><th>HTTP</th><th>Title</th></tr>
${pageRows || `<tr><td colspan="3">No page could be loaded.</td></tr>`}
</table>

<h2>Test cases</h2>
${casesHtml(model)}

<h2>Observations from the scan</h2>
${observations}

<h2>Scope and limits</h2>
<ul>${model.notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul>
</body>
</html>`;
}
