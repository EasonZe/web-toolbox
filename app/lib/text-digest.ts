import { toolLimits } from "./resource-limits";
export const digestAlgorithms = ["SHA-256", "SHA-384", "SHA-512"] as const;
export type DigestAlgorithm = typeof digestAlgorithms[number];
export type DigestOptions = { algorithm: DigestAlgorithm; mode: "hash" | "hmac"; encoding: "utf8" | "hex"; key: string; keyEncoding: "utf8" | "hex" };
export type DigestResult = { hex: string; base64: string; bytes: number };

function inputBytes(text: string, encoding: DigestOptions["encoding"]) {
  if (encoding === "hex") {
    const value = text.replace(/[\t\n\r ]/g, "");
    if (!/^(?:[a-f\d]{2})*$/i.test(value)) throw new Error("Hex 输入须为完整字节（每字节两位），不要包含 0x 前缀。");
    return Uint8Array.from({ length: value.length / 2 }, (_, i) => parseInt(value.slice(i * 2, i * 2 + 2), 16));
  }
  if (encoding !== "utf8") throw new Error("输入编码无效。");
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("文本包含不成对的 Unicode 代理字符。");
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("文本包含不成对的 Unicode 代理字符。");
  }
  return new TextEncoder().encode(text);
}

export async function digestText(text: string, options: DigestOptions, signal: AbortSignal): Promise<DigestResult> {
  signal.throwIfAborted();
  if (!digestAlgorithms.includes(options.algorithm) || !["hash", "hmac"].includes(options.mode)) throw new Error("摘要算法或模式无效。");
  if (text.length > toolLimits.text.codecChars) throw new Error("输入最多 200 万字符。");
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("此浏览器不支持 Web Crypto，请通过 HTTPS 或 localhost 访问。");
  const data = inputBytes(text, options.encoding);
  let keyBytes: Uint8Array<ArrayBuffer> | undefined;
  try {
    let buffer: ArrayBuffer;
    if (options.mode === "hmac") {
      if (options.key.length > toolLimits.textDigest.keyBytes * 3) throw new Error("HMAC 密钥最多 64 KiB。");
      keyBytes = inputBytes(options.key, options.keyEncoding);
      if (!keyBytes.length || keyBytes.length > toolLimits.textDigest.keyBytes) throw new Error("HMAC 密钥不能为空，且最多 64 KiB。");
      const key = await subtle.importKey("raw", keyBytes, { name: "HMAC", hash: options.algorithm }, false, ["sign"]);
      signal.throwIfAborted();
      buffer = await subtle.sign("HMAC", key, data);
    } else buffer = await subtle.digest(options.algorithm, data);
    signal.throwIfAborted();
    const output = new Uint8Array(buffer);
    return { hex: Array.from(output, (v) => v.toString(16).padStart(2, "0")).join(""), base64: btoa(String.fromCharCode(...output)), bytes: data.length };
  } finally {
    data.fill(0); keyBytes?.fill(0);
  }
}

export function compareTextDigest(expected: string, hex: string) {
  if (!expected.trim()) return "";
  const normalized = expected.trim().toLowerCase();
  if (!/^[a-f\d]+$/.test(normalized) || normalized.length !== hex.length) return "待核对值不是同一算法的完整 Hex 摘要。";
  return normalized === hex ? "摘要一致。" : "摘要不一致，请检查输入编码、换行、空格、算法和密钥。";
}
