import { get } from "jsonpointer";
import { parseTree, printParseErrorCode, visit, type Node, type ParseError } from "jsonc-parser";
import { toolLimits } from "./resource-limits";

const nodeTag = Symbol("json-node");
interface Indexed { [key: string]: Indexed; [nodeTag]: Node }
export type PointerResult = { output: string; matched: number; total: number };

function indexDocument(text: string) {
  if (!text.trim()) throw new Error("请输入 JSON。");
  if (text.length > toolLimits.text.jsonChars) throw new Error("JSON 最多 500 万字符。");
  let depth = 0, count = 0;
  const enter = () => { if (++depth > toolLimits.structured.depth) throw new Error("JSON 嵌套不能超过 100 层。"); };
  visit(text, { onObjectBegin: enter, onArrayBegin: enter, onObjectEnd: () => { depth--; }, onArrayEnd: () => { depth--; } });
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  if (!root || errors.length) {
    const error = errors[0], lines = text.slice(0, error?.offset ?? 0).split(/\r\n|\r|\n/);
    throw new Error(`JSON 第 ${lines.length} 行、第 ${lines.at(-1)!.length + 1} 列：${error ? printParseErrorCode(error.error) : "没有有效内容"}`);
  }
  function build(node: Node): Indexed {
    if (++count > toolLimits.structured.nodes) throw new Error("JSON 数据节点超过 25 万，请分批提取。");
    // A read-only structural index: values keep their original source slices,
    // including large integers. Symbols cannot collide with user string keys.
    const value = Object.create(null) as Indexed;
    Object.defineProperty(value, nodeTag, { value: node });
    if (node.type === "object") for (const property of node.children ?? []) {
      const key = property.children![0].value as string;
      if (Object.hasOwn(value, key)) throw new Error(`JSON 存在重复字段：${key.slice(0, 80)}`);
      value[key] = build(property.children![1]);
    }
    else if (node.type === "array") (node.children ?? []).forEach((child, index) => { value[String(index)] = build(child); });
    return value;
  }
  return build(root);
}

export function normalizePointer(input: string) {
  let value = input;
  if (value.startsWith("#")) {
    try { value = decodeURIComponent(value.slice(1)); }
    catch { throw new Error("路径片段包含无效的百分号或 UTF-8 编码。"); }
  }
  if (value !== "" && !value.startsWith("/")) throw new Error("路径须以 / 开头；整个文档使用 #。");
  if (/~(?![01])/u.test(value)) throw new Error("路径中的 ~ 只支持 ~0 和 ~1 转义。");
  if (value.length > toolLimits.jsonPointer.chars) throw new Error("路径过长。");
  return value;
}

function resolvePointer(root: Indexed, pointer: string) {
  let current = root;
  if (pointer !== "") for (const part of pointer.slice(1).split("/")) {
    const token = part.replaceAll("~1", "/").replaceAll("~0", "~");
    const kind = current[nodeTag].type;
    if (kind === "array" && !/^(0|[1-9]\d*)$/.test(token)) throw new Error("数组索引须为从 0 开始的整数，不能使用前导零、负数或 -。");
    if (!["object", "array"].includes(kind) || !Object.hasOwn(current, token)) return undefined;
    current = current[token];
  }
  // Own-property and array-index checks above deliberately tighten the package's
  // permissive getter; no setter, inherited property or script query is exposed.
  return get(root, pointer) as Indexed;
}

export function extractJsonPointers(text: string, paths: string): PointerResult {
  if (paths.length > toolLimits.jsonPointer.chars) throw new Error("路径输入最多 32768 字符。");
  const inputs = paths.split(/\r\n|\r|\n/).filter((line) => line !== "");
  if (!inputs.length || inputs.length > toolLimits.jsonPointer.paths) throw new Error("每行一个路径，一次提取 1～200 个；整个文档使用 #。");
  const pointers = inputs.map(normalizePointer), root = indexDocument(text), rows: string[] = [];
  let matched = 0, length = 4;
  for (let i = 0; i < pointers.length; i++) {
    const selected = resolvePointer(root, pointers[i]);
    const head = `  {"pointer":${JSON.stringify(inputs[i])},"found":${Boolean(selected)}`;
    const node = selected?.[nodeTag];
    const valueLength = node ? node.length : 0;
    length += head.length + valueLength + 20;
    if (length > toolLimits.text.resultChars) throw new Error("提取结果超过 3200 万字符，请减少路径或分批提取。");
    rows.push(node ? `${head},"value":${text.slice(node.offset, node.offset + node.length)}}` : `${head}}`);
    if (node) matched++;
  }
  return { output: `[\n${rows.join(",\n")}\n]`, matched, total: inputs.length };
}
