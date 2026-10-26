import { parseDocument, stringify } from "yaml";
import { parseTree, printParseErrorCode, type ParseError, type Node } from "jsonc-parser";
import { toolLimits } from "./resource-limits";
export type YamlDirection = "yaml-to-json" | "json-to-yaml";
function jsonInput(text: string) {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (!root || errors.length) {
    const error = errors[0], before = text.slice(0, error?.offset ?? 0).split("\n");
    throw new Error(`JSON 第 ${before.length} 行、第 ${before.at(-1)!.length + 1} 列：${error ? printParseErrorCode(error.error) : "没有有效内容"}`);
  }
  const pending: { node: Node; depth: number }[] = [{ node: root, depth: 0 }]; let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++count > toolLimits.structured.nodes || depth > toolLimits.structured.depth) throw new Error("数据节点或嵌套层数过多，请分批转换。");
    if (node.type === "object") {
      const seen = new Set<string>();
      for (const property of node.children ?? []) {
        const key = property.children![0].value as string;
        if (seen.has(key)) throw new Error(`JSON 存在重复字段：${key.slice(0, 80)}`);
        seen.add(key); pending.push({ node: property.children![1], depth: depth + 1 });
      }
    } else if (node.type === "array") for (const child of node.children ?? []) pending.push({ node: child, depth: depth + 1 });
  }
  return JSON.parse(text) as unknown;
}
export function convertYaml(text: string, direction: YamlDirection, indent: number) {
  if (!["yaml-to-json", "json-to-yaml"].includes(direction) || ![2, 4].includes(indent)) throw new Error("转换方式或缩进无效。");
  if (!text.trim()) throw new Error("请先输入 YAML 或 JSON。");
  if (text.length > toolLimits.text.jsonChars) throw new Error("最多处理 500 万字符，请分批转换。");
  text = text.replace(/^\uFEFF/, "");
  let data: unknown;
  if (direction === "json-to-yaml") data = jsonInput(text);
  else {
    const doc = parseDocument(text, { version: "1.2", schema: "core", uniqueKeys: true, stringKeys: true, intAsBigInt: true, prettyErrors: true });
    if (doc.errors.length) throw new Error(`YAML 错误：${doc.errors[0].message}`);
    if (doc.warnings.length) throw new Error(`YAML 警告：${doc.warnings[0].message}`);
    if (doc.directives?.yaml.version !== "1.2") throw new Error("仅支持 YAML 1.2，请移除或更新 1.1 版本指令。");
    try { data = doc.toJS({ maxAliasCount: 100 }); }
    catch { throw new Error("YAML 别名无法展开或超过安全数量，请简化锚点引用。"); }
  }
  let nodes = 0, characters = 0; const ancestors = new Set<object>();
  function compatible(value: unknown, depth: number): unknown {
    if (++nodes > toolLimits.structured.nodes || depth > toolLimits.structured.depth) throw new Error("数据节点或嵌套层数过多，请分批转换。");
    if (typeof value === "bigint") {
      if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("整数超过 JSON 安全范围，请把长编号加引号作为字符串保存。");
      return Number(value);
    }
    if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error("数字非有限或超过安全整数范围，请改为字符串。");
    if (typeof value === "string") characters += JSON.stringify(value).length;
    else if (value === null || typeof value === "number" || typeof value === "boolean") characters += 24;
    else if (typeof value === "object") {
      if (ancestors.has(value)) throw new Error("检测到循环别名，不能转换为 JSON。");
      ancestors.add(value);
      let output: unknown;
      if (Array.isArray(value)) output = value.map((item) => compatible(item, depth + 1));
      else {
        if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error("包含 JSON 不支持的数据类型。");
        const record: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
          characters += JSON.stringify(key).length;
          if (characters > toolLimits.text.resultChars) throw new Error("展开后的文本过大，请减少别名或分批处理。");
          Object.defineProperty(record, key, { value: compatible(item, depth + 1), enumerable: true });
        }
        output = record;
      }
      ancestors.delete(value); return output;
    } else throw new Error("包含 JSON 不支持的数据类型。");
    if (characters > toolLimits.text.resultChars) throw new Error("展开后的文本过大，请减少别名或分批处理。");
    return value;
  }
  const safe = compatible(data, 0);
  const result = direction === "yaml-to-json" ? JSON.stringify(safe, null, indent) : stringify(safe, { indent, lineWidth: 0, aliasDuplicateObjects: false });
  if (result.length > toolLimits.text.resultChars) throw new Error("输出超过 3200 万字符，请分批处理。");
  return result;
}
