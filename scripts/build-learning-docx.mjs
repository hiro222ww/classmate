#!/usr/bin/env node
/**
 * docs/learning/*.md → Classmate開発監督入門.docx (+ PDF if LibreOffice/pandoc available)
 *
 * Usage: node scripts/build-learning-docx.mjs
 *        npm run build:learning-docx
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  LineRuleType,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  ShadingType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LEARNING_DIR = path.join(ROOT, "docs", "learning");
const OUT_DOCX = path.join(LEARNING_DIR, "Classmate開発監督入門.docx");
const OUT_PDF = path.join(LEARNING_DIR, "Classmate開発監督入門.pdf");

const BODY_FONT = "游ゴシック";
const HEADING_FONT = "游ゴシック Medium";
const CODE_FONT = "Consolas";

/** A4, やや広めの余白 (twips: 1mm ≈ 56.7) */
const PAGE = {
  width: 11906,
  height: 16838,
  margin: { top: 1700, right: 1700, bottom: 1700, left: 1700 },
};

const SPACING = {
  afterParagraph: 160,
  afterHeading1: 280,
  afterHeading2: 220,
  afterHeading3: 180,
  line: 360,
};

function listMarkdownFiles() {
  return fs
    .readdirSync(LEARNING_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => path.join(LEARNING_DIR, f));
}

function parseInline(text) {
  const runs = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|[^`*]+)/g;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const part = m[0];
    if (part.startsWith("`") && part.endsWith("`")) {
      runs.push(
        new TextRun({
          text: part.slice(1, -1),
          font: CODE_FONT,
          size: 20,
          shading: { type: ShadingType.CLEAR, fill: "F3F4F6" },
        })
      );
    } else if (part.startsWith("**") && part.endsWith("**")) {
      runs.push(
        new TextRun({ text: part.slice(2, -2), bold: true, font: BODY_FONT, size: 22 })
      );
    } else if (part.startsWith("*") && part.endsWith("*")) {
      runs.push(
        new TextRun({ text: part.slice(1, -1), italics: true, font: BODY_FONT, size: 22 })
      );
    } else if (part.length > 0) {
      runs.push(new TextRun({ text: part, font: BODY_FONT, size: 22 }));
    }
  }
  if (runs.length === 0) {
    runs.push(new TextRun({ text: "", font: BODY_FONT, size: 22 }));
  }
  return runs;
}

function bodyParagraph(children, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? SPACING.afterParagraph, line: SPACING.line, lineRule: LineRuleType.AUTO },
    alignment: opts.alignment,
    children: Array.isArray(children) ? children : parseInline(String(children)),
  });
}

function headingParagraph(level, text) {
  const map = {
    1: { heading: HeadingLevel.HEADING_1, size: 32, after: SPACING.afterHeading1 },
    2: { heading: HeadingLevel.HEADING_2, size: 28, after: SPACING.afterHeading2 },
    3: { heading: HeadingLevel.HEADING_3, size: 24, after: SPACING.afterHeading3 },
    4: { heading: HeadingLevel.HEADING_4, size: 22, after: SPACING.afterHeading3 },
  };
  const cfg = map[level] ?? map[4];
  return new Paragraph({
    heading: cfg.heading,
    spacing: { before: level <= 2 ? 240 : 160, after: cfg.after, line: SPACING.line, lineRule: LineRuleType.AUTO },
    children: [
      new TextRun({
        text,
        font: HEADING_FONT,
        size: cfg.size,
        bold: true,
      }),
    ],
  });
}

function codeBlockParagraph(lines) {
  return new Paragraph({
    spacing: { before: 120, after: 200, line: 280, lineRule: LineRuleType.AUTO },
    shading: { type: ShadingType.CLEAR, fill: "F8FAFC" },
    border: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
    },
    indent: { left: 360, right: 360 },
    children: lines.map((line, i) =>
      new TextRun({
        text: (i > 0 ? "\n" : "") + line,
        font: CODE_FONT,
        size: 18,
      })
    ),
  });
}

function parseTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  return trimmed
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

function isTableSeparator(cells) {
  return cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, "")));
}

function buildTable(rows) {
  const tableRows = rows.map(
    (cells, rowIdx) =>
      new TableRow({
        children: cells.map(
          (cell) =>
            new TableCell({
              width: { size: Math.floor(9000 / cells.length), type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              shading:
                rowIdx === 0
                  ? { type: ShadingType.CLEAR, fill: "EEF2FF" }
                  : undefined,
              children: [
                bodyParagraph(parseInline(cell), { after: 80 }),
              ],
            })
        ),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

function markdownToBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (line.trim() === "---") {
      blocks.push(bodyParagraph("", { after: 120 }));
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push(headingParagraph(heading[1].length, heading[2].trim()));
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      if (lang === "mermaid") {
        blocks.push(
          bodyParagraph(
            parseInline("【図解（PC版教材で参照）】"),
            { after: 80 }
          )
        );
        blocks.push(codeBlockParagraph(codeLines));
      } else {
        blocks.push(codeBlockParagraph(codeLines));
      }
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push(
        new Paragraph({
          spacing: { after: SPACING.afterParagraph, line: SPACING.line, lineRule: LineRuleType.AUTO },
          indent: { left: 480 },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" } },
          children: parseInline(quoteLines.join(" ")),
        })
      );
      continue;
    }

    if (parseTableRow(line)) {
      const tableRows = [];
      while (i < lines.length && parseTableRow(lines[i])) {
        const cells = parseTableRow(lines[i]);
        if (!isTableSeparator(cells)) tableRows.push(cells);
        i += 1;
      }
      if (tableRows.length > 0) {
        blocks.push(buildTable(tableRows));
        blocks.push(bodyParagraph("", { after: 120 }));
      }
      continue;
    }

    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && (/^[-*]\s+/.test(lines[i]) || /^\d+\.\s+/.test(lines[i]))) {
        const bullet = lines[i].replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
        items.push(bullet);
        i += 1;
      }
      for (const item of items) {
        blocks.push(
          new Paragraph({
            spacing: { after: 100, line: SPACING.line, lineRule: LineRuleType.AUTO },
            bullet: { level: 0 },
            children: parseInline(item),
          })
        );
      }
      blocks.push(bodyParagraph("", { after: 80 }));
      continue;
    }

    const paraLines = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("> ") &&
      !parseTableRow(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      lines[i].trim() !== "---"
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push(bodyParagraph(paraLines.join(" ")));
  }

  return blocks;
}

function buildDocument(files) {
  const children = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 400, line: SPACING.line },
      children: [
        new TextRun({
          text: "Classmate開発監督入門",
          font: HEADING_FONT,
          size: 44,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200, line: SPACING.line },
      children: [
        new TextRun({
          text: "AIに振り回されないための TypeScript・React・WebRTC 基礎",
          font: BODY_FONT,
          size: 24,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 800, line: SPACING.line },
      children: [
        new TextRun({
          text: "（印刷用教材 — Markdownから自動生成）",
          font: BODY_FONT,
          size: 20,
          color: "6B7280",
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({ text: "目次", font: HEADING_FONT, size: 32, bold: true }),
      ],
      spacing: { after: 240 },
    }),
    new TableOfContents("目次", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "※ Wordで開いたあと、目次を右クリック →「フィールドの更新」でページ番号を反映してください。",
          font: BODY_FONT,
          size: 18,
          color: "6B7280",
          italics: true,
        }),
      ],
      spacing: { before: 200, after: 200 },
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  files.forEach((filePath, index) => {
    const markdown = fs.readFileSync(filePath, "utf8");
    const blocks = markdownToBlocks(markdown);
    children.push(...blocks);
    if (index < files.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: 22 },
          paragraph: { spacing: { line: SPACING.line, lineRule: LineRuleType.AUTO } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: PAGE.margin,
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Classmate開発監督入門",
                    font: BODY_FONT,
                    size: 18,
                    color: "9CA3AF",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

async function tryBuildPdf() {
  const sofficeBins = [
    "/opt/homebrew/bin/soffice",
    "/usr/local/bin/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  ];
  for (const bin of sofficeBins) {
    if (!fs.existsSync(bin)) continue;
    const res = spawnSync(
      bin,
      [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        LEARNING_DIR,
        OUT_DOCX,
      ],
      { stdio: "pipe" }
    );
    if (res.status === 0 && fs.existsSync(OUT_PDF)) {
      return true;
    }
  }

  try {
    execSync("pandoc --version", { stdio: "ignore" });
    execSync(
      `pandoc "${OUT_DOCX}" -o "${OUT_PDF}"`,
      { stdio: "pipe" }
    );
    return fs.existsSync(OUT_PDF);
  } catch {
    return false;
  }
}

async function main() {
  const files = listMarkdownFiles();
  if (files.length === 0) {
    console.error("No markdown files in docs/learning/");
    process.exit(1);
  }

  console.log("Input files:");
  for (const f of files) console.log(`  - ${path.basename(f)}`);

  const doc = buildDocument(files);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT_DOCX, buffer);
  console.log(`\nWrote: ${OUT_DOCX}`);

  const pdfOk = await tryBuildPdf();
  if (pdfOk) {
    console.log(`Wrote: ${OUT_PDF}`);
  } else {
    console.log(
      "\nPDF: LibreOffice / pandoc が見つからないためスキップしました。"
    );
    console.log("  → Wordで開き「PDFとして保存」でも作成できます。");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
