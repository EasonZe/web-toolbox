import { SaxesParser } from "saxes";
import { format } from "prettier/standalone";
import xmlPlugin from "@prettier/plugin-xml";
import { toolLimits } from "./resource-limits";

export type XmlOptions = { mode: "format" | "validate"; indent: number; reflow: boolean };
export type XmlResult = { output: string; elements: number; attributes: number; depth: number; changed: boolean };

function inspect(text: string) {
  const parser = new SaxesParser({ xmlns: true });
  const stack: string[] = [];
  let elements = 0, attributes = 0, depth = 0, nodes = 0;
  function count() { if (++nodes > toolLimits.structured.nodes) throw new Error("XML 节点超过 25 万，请分批处理。"); }
  parser.on("error", (error) => { throw new Error(`XML 第 ${parser.line} 行，第 ${parser.column} 列：${error.message.replace(/^\d+:\d+:\s*/, "")}`); });
  parser.on("doctype", () => { throw new Error("不支持 DTD 或自定义实体声明，不会请求外部资源。"); });
  parser.on("xmldecl", (declaration) => { if (declaration.encoding && !/^utf-8$/i.test(declaration.encoding)) throw new Error("仅支持 UTF-8 XML 文档；请先转换文件编码与 XML 编码声明。"); });
  parser.on("opentag", (tag) => {
    count(); elements++; stack.push(tag.name); depth = Math.max(depth, stack.length);
    if (depth > toolLimits.structured.depth) throw new Error("XML 嵌套超过 100 层。");
    Object.values(tag.attributes).forEach(() => {
      count(); attributes++;
    });
  });
  parser.on("closetag", () => { stack.pop(); });
  parser.on("text", count);
  parser.on("cdata", count);
  parser.on("comment", count); parser.on("processinginstruction", count);
  // Chunking bounds parser buffering without interpreting stylesheet instructions or entities.
  for (let offset = 0; offset < text.length; offset += 65536) parser.write(text.slice(offset, offset + 65536));
  parser.close();
  return { elements, attributes, depth };
}

export async function processXml(text: string, options: XmlOptions): Promise<XmlResult> {
  if (typeof text !== "string" || !text.trim()) throw new Error("请输入 XML 文档。");
  if (text.length > toolLimits.text.formatChars) throw new Error("XML 最多处理 500 万字符。");
  if (!["format", "validate"].includes(options.mode) || ![2, 4].includes(options.indent) || typeof options.reflow !== "boolean") throw new Error("XML 处理参数无效。");
  const input = inspect(text);
  const output = options.mode === "validate" ? text : await format(text, { parser: "xml", plugins: [xmlPlugin], tabWidth: options.indent, printWidth: 100, xmlWhitespaceSensitivity: options.reflow ? "ignore" : "strict", endOfLine: "lf", embeddedLanguageFormatting: "off" });
  if (output.length > toolLimits.text.resultChars) throw new Error("格式化结果过大，请分批处理。");
  if (options.mode !== "validate") {
    const after = inspect(output);
    if (after.elements !== input.elements || after.attributes !== input.attributes) throw new Error("格式化引擎无法保留此文档结构，已停止；请使用仅校验。");
  }
  return { output, elements: input.elements, attributes: input.attributes, depth: input.depth, changed: output !== text };
}
