import { renderDataTable, renderObservationTable } from "./markdown-protocol.js";
import { policy } from "./policy.js";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { OfficeParser } from "officeparser";
import type { Project, Upload } from "../../../packages/shared/types.js";
import { projectDir, save } from "./store.js";
import { hash } from "./validation.js";
export const extensions = [
  ".csv",
  ".tsv",
  ".xlsx",
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".json",
];
export async function ingest(
  p: Project,
  name: string,
  buffer: Buffer,
): Promise<Upload> {
  const ext = path.extname(name).toLowerCase();
  if (!extensions.includes(ext))
    throw new Error("支持 CSV、TSV、XLSX、PDF、DOCX、TXT、Markdown、JSON");
  if (buffer.length > policy.upload_limit_mb * 1024 * 1024)
    throw new Error(`文件超过配置的上传上限（${policy.upload_limit_mb}MB）`);
  const id = randomUUID(),
    root = projectDir(p.id),
    rel = `input/${id}${ext}`,
    file = path.join(root, rel);
  await writeFile(file, buffer);
  const content = await normalizeMaterial(file, buffer, ext);
  const normalized = `research/${id}.md`;
  await writeFile(
    path.join(root, normalized),
    `# ${name}\n\n来源：${rel}\n\n${content}`,
  );
  const upload = {
    id,
    name,
    path: rel,
    normalized,
    sha256: hash(buffer.toString("base64")),
    size: buffer.length,
  };
  p.uploads.push(upload);
  await save(p);
  return upload;
}

/** Shared upload/download normalization; preserves all rows and worksheets. */
export async function normalizeMaterial(file: string, buffer: Buffer, ext: string, maxRows = Infinity): Promise<string> {
  let content = "";
  if (ext === ".csv" || ext === ".tsv") {
    const rows = parse(buffer.toString("utf8").replace(/^\uFEFF/, ""), {
      delimiter: ext === ".tsv" ? "\t" : ",",
      skip_empty_lines: true,
      relax_column_count: true,
    });
    if(rows.length-1 > maxRows)throw new Error("数据文件超过行数上限，请选择更小文件或来源切片");
    content = "原始首行可能为表头；原始行号与文件对应。\n\n" + renderDataTable(rows);
  } else if (ext === ".xlsx") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const sheets: string[] = [];
    let totalRows=0;
    wb.eachSheet((sheet) => {
      totalRows+=sheet.rowCount;
      if(totalRows>maxRows+wb.worksheets.length)throw new Error("Excel 数据超过行数上限，请选择更小文件");
      sheets.push(`## Sheet: ${sheet.name}`);
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: true }, row => {
        rows.push(Array.from({ length: sheet.columnCount }, (_, i) => row.getCell(i + 1).text));
      });
      sheets.push(renderDataTable(rows));
    });
    content = sheets.join("\n");
  } else if (ext === ".pdf" || ext === ".docx") {
    const ast = await OfficeParser.parseOffice(file, { ocr: false });
    content = String((await ast.to("text")).value);
    await writeFile(
      `${file}.ast.json`,
      JSON.stringify(ast),
    );
  } else if(ext === ".json") {
    const parsed=JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/,""));
    if(Array.isArray(parsed) && parsed.length && parsed.every(row=>row && typeof row === "object" && !Array.isArray(row))) {
      if(parsed.length>maxRows)throw new Error("JSON 数据超过行数上限");
      const keys=[...new Set<string>(parsed.flatMap(row=>Object.keys(row)))];
      content=renderObservationTable([keys,...parsed.map(row=>keys.map(key=>row[key] == null ? "" : typeof row[key] === "object" ? JSON.stringify(row[key]) : String(row[key])))]);
    } else content=JSON.stringify(parsed,null,2);
  } else content = buffer.toString("utf8");
  if (!content.trim()) throw new Error("文件未提取出文本；扫描 PDF 请先 OCR");
  if (content.length > 8_000_000)
    throw new Error("提取内容超过 8MB，请拆分文件");
  return content;
}
