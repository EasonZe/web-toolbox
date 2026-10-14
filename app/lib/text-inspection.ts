import { toolLimits } from "./resource-limits";
import {
  applyEdits,
  createScanner,
  format,
  parse,
  printParseErrorCode,
  type ParseError,
  visit,
} from "jsonc-parser";
import { diffLines, diffChars } from "diff";

export function inspectJson(text: string, compact = false) {
  if (!text.trim()) throw new Error("请输入 JSON。");
  if (text.length > toolLimits.text.jsonChars) throw new Error("JSON 最多 500 万字符。");
  let depth = 0;
  visit(text, {
    onObjectBegin() {
      if (++depth > 100) throw new Error("JSON 嵌套不能超过 100 层。");
    },
    onObjectEnd() {
      depth--;
    },
    onArrayBegin() {
      if (++depth > 100) throw new Error("JSON 嵌套不能超过 100 层。");
    },
    onArrayEnd() {
      depth--;
    },
  });
  const errors: ParseError[] = [];
  parse(text, errors, {
    allowTrailingComma: false,
    disallowComments: true,
    allowEmptyContent: false,
  });
  if (errors.length) {
    const first = errors[0],
      before = text.slice(0, first.offset),
      lines = before.split(/\r\n|\r|\n/);
    return {
      output: "",
      error: `${printParseErrorCode(first.error)} · 第 ${lines.length} 行，第 ${lines.at(-1)!.length + 1} 列`,
      offset: first.offset,
      length: Math.max(1, first.length),
    };
  }
  // Format lexical tokens instead of stringify: large integers, duplicate keys
  // and numeric spelling must not silently change during formatting.
  let output = "";
  if (compact) {
    const scanner = createScanner(text, true);
    for (scanner.scan(); scanner.getTokenLength() > 0; scanner.scan())
      output += text.slice(
        scanner.getTokenOffset(),
        scanner.getTokenOffset() + scanner.getTokenLength(),
      );
  } else
    output = applyEdits(
      text,
      format(text, undefined, { tabSize: 2, insertSpaces: true, eol: "\n" }),
    );
  return { output, error: "", offset: -1, length: 0 };
}
export type DiffRow = {
  old: string | null;
  next: string | null;
  kind: "same" | "added" | "removed" | "changed";
  oldParts?: { value: string; changed: boolean }[];
  nextParts?: { value: string; changed: boolean }[];
};
export function compareTexts(old: string, next: string): DiffRow[] {
  if (old.length + next.length > toolLimits.text.diffChars)
    throw new Error("两份文本合计最多 200 万字符。");
  const changes = diffLines(old, next, { timeout: 5000, maxEditLength: 20000 });
  if (!changes) throw new Error("文本差异过多，请分段对比。");
  const rows: DiffRow[] = [],
    lines = (value: string) => value.replace(/\n$/, "").split("\n");
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];
    if (change.removed && changes[index + 1]?.added) {
      const left = lines(change.value),
        right = lines(changes[++index].value);
      for (let n = 0; n < Math.max(left.length, right.length); n++) {
        const a = left[n] ?? null,
          b = right[n] ?? null;
        const parts =
          a !== null && b !== null && a.length + b.length < 8000
            ? diffChars(a, b, { timeout: 50, maxEditLength: 1000 })
            : undefined;
        rows.push({
          old: a,
          next: b,
          kind: a === null ? "added" : b === null ? "removed" : "changed",
          oldParts: parts
            ?.filter((p) => !p.added)
            .map((p) => ({ value: p.value, changed: Boolean(p.removed) })),
          nextParts: parts
            ?.filter((p) => !p.removed)
            .map((p) => ({ value: p.value, changed: Boolean(p.added) })),
        });
      }
    } else
      for (const line of lines(change.value))
        rows.push({
          old: change.added ? null : line,
          next: change.removed ? null : line,
          kind: change.added ? "added" : change.removed ? "removed" : "same",
        });
  }
  if (rows.length > toolLimits.text.diffRows) throw new Error("对比结果最多 10 万行，请分段处理。");
  return rows;
}
const invisibleNames: Record<number, string> = {
  0x200b: "零宽空格",
  0x200c: "零宽非连接符",
  0x200d: "零宽连接符",
  0x2060: "单词连接符",
  0xfeff: "BOM / 零宽不换行空格",
  0xa0: "不换行空格",
  0x3000: "全角空格",
  0x202f: "窄不换行空格",
  0x202e: "从右向左覆盖符",
  0x202d: "从左向右覆盖符",
  0xad: "软连字符",
};
export function inspectUnicode(text: string) {
  if ([...text].length > toolLimits.text.unicodePoints)
    throw new Error("最多检查 100000 个 Unicode 字符。");
  let offset = 0;
  return [...text].map((character) => {
    const code = character.codePointAt(0)!,
      position = offset;
    offset += character.length;
    const hidden =
      (/[\p{Cf}\p{Zs}\p{Cc}]/u.test(character) &&
        ![" ", "\n", "\r", "\t"].includes(character)) ||
      (code >= 0xd800 && code <= 0xdfff);
    return {
      character,
      position,
      code: `U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
      utf16: Array.from({ length: character.length }, (_, i) =>
        character.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0"),
      ).join(" "),
      utf8: [...new TextEncoder().encode(character)]
        .map((v) => v.toString(16).toUpperCase().padStart(2, "0"))
        .join(" "),
      hidden,
      name:
        invisibleNames[code] ??
        (code >= 0xd800 && code <= 0xdfff
          ? "未配对代理项（无效 Unicode）"
          : hidden
            ? "隐藏 / 特殊空白字符"
            : character === " "
              ? "普通空格"
              : character === "\n"
                ? "换行"
                : character === "\t"
                  ? "制表符"
                  : ""),
    };
  });
}
