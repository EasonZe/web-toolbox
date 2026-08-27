import { createMD5, createSHA1, createSHA256, createSHA512 } from "hash-wasm";
import { hashAlgorithms, type HashAlgorithm, type HashResults } from "./file-hash";

export const hashChunkSize = 2 * 1024 * 1024;
const factories = { MD5: createMD5, "SHA-1": createSHA1, "SHA-256": createSHA256, "SHA-512": createSHA512 };

export async function calculateFileHashes(
  file: Blob,
  algorithms: readonly HashAlgorithm[],
  onProgress: (loaded: number, total: number) => void = () => {},
  signal?: AbortSignal,
): Promise<HashResults> {
  const selected = [...new Set(algorithms)];
  if (!selected.length || selected.some((algorithm) => !hashAlgorithms.includes(algorithm))) {
    throw new Error("请至少选择一种支持的哈希算法。");
  }
  const checkCancelled = () => {
    if (signal?.aborted) throw new DOMException("计算已取消", "AbortError");
  };
  checkCancelled();
  const hashers = await Promise.all(selected.map((algorithm) => factories[algorithm]()));
  checkCancelled();
  hashers.forEach((hasher) => hasher.init());
  onProgress(0, file.size);
  let lastUpdate = 0;
  for (let offset = 0; offset < file.size; offset += hashChunkSize) {
    checkCancelled();
    const end = Math.min(offset + hashChunkSize, file.size);
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    checkCancelled();
    hashers.forEach((hasher) => hasher.update(chunk));
    const now = Date.now();
    if (end === file.size || now - lastUpdate >= 80) {
      onProgress(end, file.size);
      lastUpdate = now;
    }
  }
  checkCancelled();
  return Object.fromEntries(selected.map((algorithm, index) => [algorithm, hashers[index].digest("hex")]));
}
