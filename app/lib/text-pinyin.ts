import { pinyin } from "pinyin-pro";
import { toolLimits } from "./resource-limits";
import type { PinyinOptions } from "./extra-tool-options";
export function convertPinyin(text: string, options: PinyinOptions) {
  if (text.length > toolLimits.text.pinyinChars) throw new Error("拼音最多处理 20 万字符，请分批转换。");
  if (!["symbol", "num", "none", "initial"].includes(options.tone) || ![" ", "-", ""].includes(options.separator)) throw new Error("拼音选项无效。");
  const result = text.split(/(\r\n|\n|\r)/).map((line) => /^[\r\n]+$/.test(line) ? line : pinyin(line, {
    toneType: options.tone === "initial" ? "none" : options.tone,
    pattern: options.tone === "initial" ? "first" : "pinyin",
    separator: options.separator, nonZh: "consecutive", surname: options.surname ? "head" : "off", traditional: true,
  })).join("");
  return options.uppercase ? result.toUpperCase() : result;
}
