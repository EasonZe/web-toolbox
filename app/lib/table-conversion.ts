import Papa from "papaparse";
import { toolLimits } from "./resource-limits";
export type TableOptions = { input: "csv" | "tsv" | "json"; output: "csv" | "tsv" | "json"; header: boolean; safeFormulae: boolean; bom: boolean };
export type TableResult = { text: string; rows: number; columns: number; preview: string[][]; protectedCells: number; extension: string; mime: string };
type Cell = string | number | boolean | null;
function checkCell(value: unknown): asserts value is Cell {
  if (value !== null && !["string", "number", "boolean"].includes(typeof value)) throw new Error("JSON 单元格只支持字符串、有限数字、布尔值或 null，不支持嵌套对象。");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("JSON 包含非有限数字。");
  if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error("JSON 包含超过安全整数范围的数字，请将长编号写为字符串。");
}
function checkShape(rows: number, columns: number, cells: number) {
  if (rows > toolLimits.table.rows || columns > toolLimits.table.columns || cells > toolLimits.table.cells) throw new Error("表格超过 10 万行、1000 列或 100 万单元格，请分批转换。");
}
export function convertTable(text: string, options: TableOptions): TableResult {
  if (![options.input, options.output].every((v) => ["csv", "tsv", "json"].includes(v))) throw new Error("表格格式无效。");
  if (!text.trim()) throw new Error("请先输入表格数据。");
  if (text.length > toolLimits.text.jsonChars) throw new Error("最多处理 500 万字符，请分批转换。");
  let rows: Cell[][] = [], keys: string[] | undefined;
  if (options.input === "json") {
    let data: unknown;
    try { data = JSON.parse(text.replace(/^\uFEFF/, "")); } catch (cause) { throw new Error(`JSON 无效：${cause instanceof Error ? cause.message : "语法错误"}`); }
    if (!Array.isArray(data) || !data.length) throw new Error("JSON 须为非空对象数组或二维数组。");
    checkShape(data.length, 0, 0);
    if (Array.isArray(data[0])) {
      let cells = 0;
      rows = data.map((row) => {
        if (!Array.isArray(row)) throw new Error("不能混用对象行和数组行。");
        cells += row.length; checkShape(data.length, row.length, cells); row.forEach(checkCell); return row;
      });
      if (rows.some((row) => row.length !== rows[0].length) || !rows[0].length) throw new Error("每行须有相同且非零的列数。");
    } else {
      if (data.some((row) => !row || Array.isArray(row) || typeof row !== "object")) throw new Error("不能混用对象行和数组行。");
      const names = new Set<string>();
      for (const row of data) { for (const key of Object.keys(row)) { names.add(key); if (names.size > toolLimits.table.columns) checkShape(0, names.size, 0); } }
      keys = [...names]; checkShape(data.length + 1, keys.length, (data.length + 1) * keys.length);
      if (!keys.length) throw new Error("对象没有可转换的字段。");
      rows = data.map((row) => keys!.map((key) => { const value = Object.hasOwn(row, key) ? row[key] : null; checkCell(value); return value; }));
    }
  } else {
    let cells = 0, failure = "";
    Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { delimiter: options.input === "tsv" ? "\t" : ",", dynamicTyping: false, skipEmptyLines: true,
      step(result, parser) {
        if (result.errors.length) failure = `第 ${rows.length + 1} 条记录：${result.errors[0].message}`;
        cells += result.data.length;
        try { checkShape(rows.length + 1, result.data.length, cells); } catch (cause) { failure = (cause as Error).message; }
        if (failure) parser.abort(); else rows.push(result.data);
      },
    });
    if (failure) throw new Error(failure);
    if (!rows.length || rows.some((row) => row.length !== rows[0].length)) throw new Error("表格各行列数不一致，请检查分隔符和引号。");
    if (options.header) {
      keys = rows.shift() as string[];
      if (keys.some((key) => !key.trim()) || new Set(keys).size !== keys.length) throw new Error("表头不能为空或重复；可关闭“首行为表头”保留原始二维数据。");
    }
  }
  let output: string, protectedCells = 0;
  const csvRows = keys ? [keys, ...rows] : rows;
  if (options.output === "json") {
    // fromEntries defines own properties safely, including __proto__ and constructor.
    output = JSON.stringify(keys ? rows.map((row) => Object.fromEntries(keys!.map((key, i) => [key, row[i]]))) : rows, null, 2);
  } else {
    const danger = /^[\s\uFEFF]*[=+\-@]/;
    const safeRows = options.safeFormulae ? csvRows.map((row) => row.map((cell) => {
      if (typeof cell === "string" && (danger.test(cell) || /^[\t\r\n]/.test(cell))) { protectedCells++; return `'${cell}`; } return cell;
    })) : csvRows;
    output = (options.bom ? "\uFEFF" : "") + Papa.unparse(safeRows, { delimiter: options.output === "tsv" ? "\t" : ",", newline: "\r\n", escapeFormulae: false });
  }
  if (output.length > toolLimits.text.resultChars) throw new Error("输出过大，请分批转换。");
  return { text: output, rows: rows.length, columns: keys?.length ?? rows[0]?.length ?? 0, preview: csvRows.slice(0, 101).map((row) => row.slice(0, 20).map((cell) => String(cell ?? "").slice(0, 300))), protectedCells, extension: options.output, mime: options.output === "json" ? "application/json" : options.output === "tsv" ? "text/tab-separated-values" : "text/csv" };
}
