import { format } from "sql-formatter";
import { toolLimits } from "./resource-limits";
import { sqlDialects, type SqlFormatOptions, type SqlFormatResult } from "./sql-format-options";

/** Formatting only. No database execution, placeholder replacement or identifier rewriting. */
export function formatSql(text: string, options: SqlFormatOptions): SqlFormatResult {
  if (typeof text !== "string" || !text.trim()) throw new Error("请输入 SQL 文本。");
  if (text.length > toolLimits.text.formatChars) throw new Error("SQL 最多处理 500 万字符，请分批格式化；输入不会被截断。");
  if (!options || !sqlDialects.some(([id]) => id === options.dialect) || ![2, 4].includes(options.indent) || !["preserve", "upper", "lower"].includes(options.keywordCase)) throw new Error("SQL 格式化参数无效。");
  let output: string;
  try {
    output = format(text, {
      language: options.dialect, tabWidth: options.indent, keywordCase: options.keywordCase,
      identifierCase: "preserve", functionCase: "preserve", dataTypeCase: "preserve",
      linesBetweenQueries: 1,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "无法解析此 SQL。";
    // Keep the engine's line / column and short code context, not an unbounded source echo.
    throw new Error(`格式化失败，请检查所选方言及此处语法。${message.length > 2000 ? `${message.slice(0, 2000)}…` : message}`);
  }
  if (output.length > toolLimits.text.resultChars) throw new Error("格式化结果超过安全范围，请分批处理。");
  return { output, changed: output !== text };
}
