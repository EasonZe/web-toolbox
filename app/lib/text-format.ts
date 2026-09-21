import {
  camelCase,
  capitalCase,
  constantCase,
  dotCase,
  kebabCase,
  noCase,
  pascalCase,
  pathCase,
  sentenceCase,
  snakeCase,
} from "change-case";
import OpenCC from "opencc-js";

export type TextTransformId =
  | "upper"
  | "lower"
  | "capital"
  | "sentence"
  | "camel"
  | "pascal"
  | "snake"
  | "kebab"
  | "constant"
  | "dot"
  | "path"
  | "no-case"
  | "simplified"
  | "traditional"
  | "halfwidth"
  | "fullwidth"
  | "normalize-space"
  | "remove-empty"
  | "sort-lines"
  | "dedupe-lines";

export const textTransformGroups = [
  {
    name: "英文格式",
    options: [
      ["upper", "全部大写", "HELLO WORLD"],
      ["lower", "全部小写", "hello world"],
      ["capital", "单词首字母", "Hello World"],
      ["sentence", "句首大写", "Hello world"],
      ["camel", "驼峰命名", "helloWorld"],
      ["pascal", "大驼峰", "HelloWorld"],
      ["snake", "下划线", "hello_world"],
      ["kebab", "短横线", "hello-world"],
      ["constant", "常量命名", "HELLO_WORLD"],
      ["dot", "点号命名", "hello.world"],
      ["path", "路径命名", "hello/world"],
      ["no-case", "空格分词", "hello world"],
    ],
  },
  {
    name: "中文与字符",
    options: [
      ["simplified", "转简体", "漢字 → 汉字"],
      ["traditional", "转繁体", "汉字 → 漢字"],
      ["halfwidth", "转半角", "ＡＢＣ → ABC"],
      ["fullwidth", "转全角", "ABC → ＡＢＣ"],
    ],
  },
  {
    name: "行与空白",
    options: [
      ["normalize-space", "整理空白", "合并多余空格"],
      ["remove-empty", "删除空行", "保留有效行"],
      ["sort-lines", "行排序", "按文字升序"],
      ["dedupe-lines", "行去重", "保留首次出现"],
    ],
  },
] as const satisfies ReadonlyArray<{
  name: string;
  options: ReadonlyArray<readonly [TextTransformId, string, string]>;
}>;

const toSimplified = OpenCC.Converter({ from: "t", to: "cn" });
const toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });

function transformLines(text: string, transform: (line: string) => string) {
  return text.split("\n").map(transform).join("\n");
}

export function toFullwidth(text: string) {
  return Array.from(text, (character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0x20) return "　";
    if (code >= 0x21 && code <= 0x7e) return String.fromCodePoint(code + 0xfee0);
    return character;
  }).join("");
}

export function normalizeTextWhitespace(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[\t ]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function transformText(text: string, transform: TextTransformId) {
  if (!text) return "";

  switch (transform) {
    case "upper": return text.toLocaleUpperCase();
    case "lower": return text.toLocaleLowerCase();
    case "capital": return transformLines(text, capitalCase);
    case "sentence": return transformLines(text, sentenceCase);
    case "camel": return transformLines(text, camelCase);
    case "pascal": return transformLines(text, pascalCase);
    case "snake": return transformLines(text, snakeCase);
    case "kebab": return transformLines(text, kebabCase);
    case "constant": return transformLines(text, constantCase);
    case "dot": return transformLines(text, dotCase);
    case "path": return transformLines(text, pathCase);
    case "no-case": return transformLines(text, noCase);
    case "simplified": return toSimplified(text);
    case "traditional": return toTraditional(text);
    case "halfwidth": return text.normalize("NFKC");
    case "fullwidth": return toFullwidth(text);
    case "normalize-space": return normalizeTextWhitespace(text);
    case "remove-empty": return text.split(/\r?\n/).filter((line) => line.trim()).join("\n");
    case "sort-lines": return text.split(/\r?\n/).sort((a, b) => a.localeCompare(b, "zh-CN")).join("\n");
    case "dedupe-lines": return [...new Set(text.split(/\r?\n/))].join("\n");
  }
}
