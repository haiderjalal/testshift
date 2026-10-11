/**
 * The document as a Word file (.docx). The docx library writes every value as text, so customer page text cannot
 * add markup to the file. The section order matches the PDF.
 */
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { SOURCE_LABEL, type DocumentModel, type NumberedCase, type Priority } from "./model";

const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };
const MUTED = "4B5563";

const text = (value: string, options: { bold?: boolean; size?: number; color?: string } = {}): Paragraph =>
  new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: value, ...options })] });

const heading = (value: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph =>
  new Paragraph({ heading: level, spacing: { before: 240, after: 120 }, children: [new TextRun(value)] });

const bullet = (value: string): Paragraph =>
  new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun(value)] });

/** A table cell. Word needs every cell to hold at least one paragraph, so an empty cell gets an empty one. */
function cell(label: string, content: Paragraph[], widthPercent: number, shaded = false): TableCell {
  const paragraphs = label ? [new Paragraph({ children: [new TextRun({ text: label, bold: true })] }), ...content] : content;
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    shading: shaded ? { type: ShadingType.CLEAR, color: "auto", fill: "F3F4F6" } : undefined,
    children: paragraphs.length > 0 ? paragraphs : [new Paragraph({})],
  });
}

/** One case as a two-column table: the label on the left, the detail on the right. */
function caseTable(c: NumberedCase): Table {
  const row = (label: string, paragraphs: Paragraph[]): TableRow =>
    new TableRow({ children: [cell(label, [], 24, true), cell("", paragraphs, 76)] });
  const rows = [
    row("Case", [new Paragraph({ children: [new TextRun({ text: `${c.code} · ${c.title}`, bold: true })] })]),
    row("Priority and type", [text(`${PRIORITY_LABEL[c.priority]} · ${c.type} · ${SOURCE_LABEL[c.source]}`)]),
    row("Feature", [text(c.feature)]),
    row("Page", [text(c.pageUrl)]),
  ];
  if (c.preconditions) rows.push(row("Preconditions", [text(c.preconditions)]));
  if (c.testData) rows.push(row("Test data", [text(c.testData)]));
  rows.push(row("Steps", c.steps.map((step, index) => text(`${index + 1}. ${step}`))));
  rows.push(row("Expected result", [text(c.expected)]));
  if (c.observed) rows.push(row("Observed in scan", [text(c.observed, { color: MUTED })]));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function summaryTable(rows: [string, number][]): Table {
  return new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, count]) => new TableRow({ children: [cell("", [text(label)], 80, true), cell("", [text(String(count))], 20)] }),
    ),
  });
}

export async function renderDocx(model: DocumentModel): Promise<Buffer> {
  const { summary } = model;
  const date = model.generatedAt.toISOString().slice(0, 10);
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [new TextRun(`Test cases for ${model.host}`)] }),
    text(`Generated ${date} from ${model.siteUrl}`, { color: MUTED }),
    heading("Summary", HeadingLevel.HEADING_1),
    summaryTable([
      ["Test cases", summary.total],
      ["High priority", summary.byPriority.high],
      ["Medium priority", summary.byPriority.medium],
      ["Low priority", summary.byPriority.low],
      [SOURCE_LABEL.crawl, summary.bySource.crawl],
      [SOURCE_LABEL.scan, summary.bySource.scan],
      [SOURCE_LABEL.ai, summary.bySource.ai],
      ["Features covered", summary.features],
      ["Pages scanned", model.pages.length],
    ]),
    heading("How to use this document", HeadingLevel.HEADING_1),
    bullet("Each case has a reference (TC-001), the page to start on, steps to follow and the result to expect."),
    bullet("Crawl rules come from what the automated crawl saw on each page. Accessibility scan cases come from an automated checker. AI-drafted scenarios were written by a model from the crawl, so review them before you rely on them."),
    bullet("Expected results describe what the site showed during the scan, or a standard the browser enforces. Where the intended behavior is unclear, confirm it with the team before you file a defect."),
    heading("Pages scanned", HeadingLevel.HEADING_1),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: [cell("Address", [], 60, true), cell("HTTP", [], 12, true), cell("Title", [], 28, true)] }),
        ...model.pages.map(
          (page) =>
            new TableRow({
              children: [
                cell("", [text(page.url)], 60),
                cell("", [text(page.status ? String(page.status) : "none")], 12),
                cell("", [text(page.title || "No title")], 28),
              ],
            }),
        ),
      ],
    }),
    heading("Test cases", HeadingLevel.HEADING_1),
  ];

  // Cases grouped under their feature, in the model's reading order.
  const groups = new Map<string, NumberedCase[]>();
  for (const c of model.cases) groups.set(c.feature, [...(groups.get(c.feature) ?? []), c]);
  if (groups.size === 0) children.push(text("No test cases were written for this site.", { color: MUTED }));
  for (const [feature, cases] of groups) {
    children.push(heading(`${feature} (${cases.length})`, HeadingLevel.HEADING_2));
    for (const c of cases) {
      children.push(caseTable(c));
      children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    }
  }

  children.push(heading("Observations from the scan", HeadingLevel.HEADING_1));
  if (model.observations.length === 0) children.push(text("The scan recorded no problems on the site's own pages.", { color: MUTED }));
  for (const line of model.observations) children.push(bullet(line));

  children.push(heading("Scope and limits", HeadingLevel.HEADING_1));
  for (const note of model.notes) children.push(bullet(note));

  const document = new Document({
    creator: "TestShift",
    title: `Test cases for ${model.host}`,
    description: "Test cases generated from an automated crawl of the site.",
    styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ children: ["TestShift · Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: "6B7280" })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
