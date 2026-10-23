import { toolLimits } from "./resource-limits";

export const passwordGroups = {
  lower: "abcdefghijklmnopqrstuvwxyz", upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789", symbols: "!@#$%^&*()-_=+[]{};:,.?",
} as const;
export type PasswordGroup = keyof typeof passwordGroups;

// Rejection sampling avoids modulo bias. A small buffer stays below Web Crypto's quota.
export function secureIndex(size: number, readByte: () => number = () => crypto.getRandomValues(new Uint8Array(1))[0]) {
  if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error("无效字符集。");
  const ceiling = 256 - (256 % size);
  for (;;) {
    const value = readByte();
    if (value < ceiling) return value % size;
  }
}
export function generateSecrets(options: { mode: "password" | "uuid"; count: number; length: number; groups: PasswordGroup[]; excludeSimilar: boolean }) {
  const { count, length } = options;
  if (!Number.isInteger(count) || count < 1 || count > toolLimits.generators.batch) throw new Error(`生成数量为 1–${toolLimits.generators.batch}。`);
  if (options.mode === "uuid") return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  });
  if (!Number.isInteger(length) || length < 8 || length > toolLimits.generators.passwordLength) throw new Error(`密码长度为 8–${toolLimits.generators.passwordLength}。`);
  const groups = [...new Set(options.groups)].map((key) => {
    if (!Object.hasOwn(passwordGroups, key)) throw new Error("无效字符类型。");
    return options.excludeSimilar ? passwordGroups[key].replace(/[ilLoO01]/g, "") : passwordGroups[key];
  });
  if (!groups.length) throw new Error("请至少选择一种字符类型。");
  const alphabet = groups.join("");
  const random = new Uint8Array(1024); let offset = random.length;
  const readByte = () => { if (offset === random.length) { crypto.getRandomValues(random); offset = 0; } return random[offset++]; };
  return Array.from({ length: count }, () => {
    // Condition on containing every selected class, without forcing predictable positions.
    for (;;) {
      const value = Array.from({ length }, () => alphabet[secureIndex(alphabet.length, readByte)]).join("");
      if (groups.every((group) => [...value].some((char) => group.includes(char)))) return value;
    }
  });
}
