import { calculateFileHashes, hashChunkSize } from "./file-hash-engine";
import { validateDuplicateFiles } from "./duplicate-file-options";
export type DuplicateMember = { index: number; name: string; path: string; lastModified: number };
export type DuplicateGroup = { size: number; sha256: string; files: DuplicateMember[] };
export type DuplicateResult = { files: number; hashed: number; groups: DuplicateGroup[]; redundant: number; redundantBytes: number };
type Hash = (file: File, signal: AbortSignal, report: (loaded: number, total: number) => void) => Promise<string>;
export async function equalFileBytes(a: Blob, b: Blob, signal: AbortSignal) {
  signal.throwIfAborted(); if (a.size !== b.size) return false;
  for (let offset = 0; offset < a.size; offset += hashChunkSize) {
    signal.throwIfAborted(); const end = Math.min(a.size, offset + hashChunkSize);
    const left = new Uint8Array(await a.slice(offset, end).arrayBuffer()); signal.throwIfAborted();
    const right = new Uint8Array(await b.slice(offset, end).arrayBuffer()); signal.throwIfAborted();
    if (left.length !== end - offset || right.length !== left.length) throw new Error("文件在读取期间发生变化，请重新选择。");
    if (!left.every((value, index) => value === right[index])) return false;
  }
  return true;
}
export async function findDuplicateFiles(files: readonly File[], signal: AbortSignal, report: (progress: number, status: string) => void = () => {}, hash: Hash = async (file, signal, report) => (await calculateFileHashes(file, ["SHA-256"], report, signal))["SHA-256"]!): Promise<DuplicateResult> {
  signal.throwIfAborted(); validateDuplicateFiles(files);
  const sizes = new Map<number, number[]>();
  files.forEach((file, index) => { const bucket = sizes.get(file.size) ?? []; bucket.push(index); sizes.set(file.size, bucket); });
  const candidates = [...sizes.values()].filter((indices) => indices.length > 1).flat(), fingerprints = new Map<string, number[]>();
  for (let i = 0; i < candidates.length; i++) {
    const index = candidates[i]; signal.throwIfAborted();
    const digest = await hash(files[index], signal, (loaded, total) => report((i + (total ? loaded / total : 1)) / candidates.length * 75, `正在计算 ${i + 1} / ${candidates.length} 个候选文件`));
    signal.throwIfAborted(); if (!/^[a-f\d]{64}$/i.test(digest)) throw new Error("SHA-256 计算结果无效。");
    const key = `${files[index].size}:${digest.toLowerCase()}`, bucket = fingerprints.get(key) ?? []; bucket.push(index); fingerprints.set(key, bucket);
  }
  const groups: DuplicateGroup[] = [];
  let compared = 0;
  for (const [key, indices] of fingerprints) {
    const exact: number[][] = [];
    for (const index of indices) {
      signal.throwIfAborted(); let found = false;
      for (const group of exact) if (await equalFileBytes(files[group[0]], files[index], signal)) { group.push(index); found = true; break; }
      if (!found) exact.push([index]);
      report(75 + ++compared / Math.max(1, candidates.length) * 24, `正在逐字节确认 ${compared} / ${candidates.length} 个候选文件`);
    }
    for (const indices of exact.filter((group) => group.length > 1)) groups.push({ size: files[indices[0]].size, sha256: key.slice(key.indexOf(":") + 1), files: indices.map((index) => ({ index, name: files[index].name, path: files[index].webkitRelativePath || files[index].name, lastModified: files[index].lastModified })) });
  }
  groups.sort((a, b) => (b.files.length - 1) * b.size - (a.files.length - 1) * a.size || a.files[0].index - b.files[0].index);
  signal.throwIfAborted();
  return { files: files.length, hashed: candidates.length, groups, redundant: groups.reduce((sum, group) => sum + group.files.length - 1, 0), redundantBytes: groups.reduce((sum, group) => sum + (group.files.length - 1) * group.size, 0) };
}
