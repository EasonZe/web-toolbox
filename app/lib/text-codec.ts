import { encodeHTML, decodeHTML } from "entities";
import { toolLimits } from "./resource-limits";

import { codecModes, type CodecMode } from "./extra-tool-options";
function validUnicode(text: string) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("文本包含不成对的 Unicode 代理字符。");
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error("文本包含不成对的 Unicode 代理字符。");
  }
  return text;
}
function base64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
function fromBase64(text: string, url: boolean) {
  const value = text.replace(/[\t\n\r ]/g, "");
  const alphabet = url ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/;
  if (!alphabet.test(value) || value.length % 4 === 1 || (value.includes("=") && value.length % 4)) throw new Error("Base64 字符或填充无效。");
  const normalized = url ? value.replaceAll("-", "+").replaceAll("_", "/") : value;
  let binary: string;
  try { binary = atob(normalized); } catch { throw new Error("Base64 编码无效。"); }
  if (btoa(binary).replace(/=+$/, "") !== normalized.replace(/=+$/, "")) throw new Error("Base64 尾部填充位无效。");
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))); }
  catch { throw new Error("解码结果不是有效 UTF-8 文本；二进制文件请使用对应的文件工具。"); }
}
function decodeUnicode(text: string) {
  return validUnicode(text.replace(/\\(?:u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|([\s\S]?))/g, (_, point, unit) => {
    if (unit) return String.fromCharCode(parseInt(unit, 16));
    if (point && parseInt(point, 16) <= 0x10ffff) return String.fromCodePoint(parseInt(point, 16));
    throw new Error("Unicode 转义无效，请使用 \\uXXXX 或 \\u{XXXXX}。");
  }));
}
export function convertCodec(text: string, mode: CodecMode, direction: "encode" | "decode") {
  if (!codecModes.some((item) => item.id === mode) || !["encode", "decode"].includes(direction)) throw new Error("编码方式无效。");
  if (text.length > toolLimits.text.codecChars) throw new Error("最多处理 200 万字符，请分批转换。");
  validUnicode(text);
  let result: string;
  if (mode === "base64" || mode === "base64url") {
    result = direction === "decode" ? fromBase64(text, mode === "base64url") : base64(text);
    if (direction === "encode" && mode === "base64url") result = result.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  } else if (mode === "html") result = direction === "encode" ? encodeHTML(text) : decodeHTML(text);
  else if (mode === "unicode") result = direction === "decode" ? decodeUnicode(text) : Array.from(text, (c) => {
    const point = c.codePointAt(0)!;
    return point > 0xffff ? `\\u{${point.toString(16)}}` : `\\u${point.toString(16).padStart(4, "0")}`;
  }).join("");
  else {
    try {
      result = direction === "decode" ? decodeURIComponent(mode === "form" ? text.replaceAll("+", " ") : text)
        : mode === "form" ? new URLSearchParams([["v", text]]).toString().slice(2) : encodeURIComponent(text);
    } catch { throw new Error("URL 编码无效，请检查百分号、十六进制和 UTF-8 字节。"); }
  }
  if (result.length > toolLimits.text.resultChars) throw new Error("输出超过 3200 万字符，请分批处理。");
  return result;
}
