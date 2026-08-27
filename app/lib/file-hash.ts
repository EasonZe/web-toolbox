export const hashAlgorithms = ["MD5", "SHA-1", "SHA-256", "SHA-512"] as const;
export type HashAlgorithm = (typeof hashAlgorithms)[number];
export type HashResults = Partial<Record<HashAlgorithm, string>>;

export type HashWorkerMessage =
  | { type: "progress"; loaded: number; total: number }
  | { type: "done"; results: HashResults }
  | { type: "error"; message: string };

const digestLengths: Record<number, HashAlgorithm> = {
  32: "MD5", 40: "SHA-1", 64: "SHA-256", 128: "SHA-512",
};

export function compareFileHash(expected: string, results: HashResults) {
  const value = expected.trim().toLowerCase();
  if (!value) return { state: "empty", message: "" };
  const algorithm = digestLengths[value.length];
  if (!algorithm || !/^[a-f0-9]+$/.test(value)) {
    return { state: "invalid", message: "请输入完整的 MD5、SHA-1、SHA-256 或 SHA-512 十六进制哈希值。" };
  }
  if (!results[algorithm]) {
    return { state: "pending", message: `待比对：请选择 ${algorithm} 并计算文件。` };
  }
  return results[algorithm]?.toLowerCase() === value
    ? { state: "match", message: `${algorithm} 一致，校验通过。` }
    : { state: "mismatch", message: `${algorithm} 不一致，请确认文件或校验值是否正确。` };
}
