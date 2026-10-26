import { toolLimits } from "./resource-limits";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { validateArchivePath, MAX_BATCH_BYTES } from "./local-files";
export type ArchiveEntry = {
  name: string;
  size: number;
  compressed: number;
  crc: number;
  offset: number;
  method: number;
};
export function inspectZip(data: Uint8Array): ArchiveEntry[] {
  if (data.length < 22 || data.length > MAX_BATCH_BYTES)
    throw new Error("ZIP 文件无效或超过 512 MB。");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  for (; end >= Math.max(0, data.length - 65557); end--)
    if (
      view.getUint32(end, true) === 0x06054b50 &&
      end + 22 + view.getUint16(end + 20, true) === data.length
    )
      break;
  if (end < Math.max(0, data.length - 65557))
    throw new Error("ZIP 中央目录损坏。");
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== view.getUint16(end + 10, true)
  )
    throw new Error("不支持分卷 ZIP。");
  const count = view.getUint16(end + 10, true),
    directorySize = view.getUint32(end + 12, true);
  let cursor = view.getUint32(end + 16, true),
    total = 0;
  if (count > toolLimits.archive.entries || cursor + directorySize !== end)
    throw new Error("最多支持 2000 个条目，不支持 ZIP64 或损坏的 ZIP。");
  const entries: ArchiveEntry[] = [],
    names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("ZIP 条目损坏。");
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true),
      crc = view.getUint32(cursor + 16, true);
    const compressed = view.getUint32(cursor + 20, true),
      size = view.getUint32(cursor + 24, true),
      nameLength = view.getUint16(cursor + 28, true);
    const next =
        cursor +
        46 +
        nameLength +
        view.getUint16(cursor + 30, true) +
        view.getUint16(cursor + 32, true),
      offset = view.getUint32(cursor + 42, true);
    if (
      next > end ||
      ![0, 8].includes(method) ||
      flags & 1 ||
      ((view.getUint32(cursor + 38, true) >>> 16) & 0xf000) === 0xa000
    )
      throw new Error("不支持加密 ZIP、符号链接或此压缩算法。");
    const name = validateArchivePath(
      strFromU8(
        data.subarray(cursor + 46, cursor + 46 + nameLength),
        !(flags & 0x800),
      ),
    );
    if (
      ["__proto__", "constructor", "prototype"].includes(name) ||
      names.has(name)
    )
      throw new Error("ZIP 存在重复或保留条目名称。");
    names.add(name);
    total += size;
    if (
      size > toolLimits.archive.entryBytes ||
      total > MAX_BATCH_BYTES ||
      size > Math.max(1048576, compressed * 1000)
    )
      throw new Error("ZIP 解压体积或压缩比超限，已停止以防止内存耗尽。");
    if (
      offset + 30 > cursor ||
      view.getUint32(offset, true) !== 0x04034b50 ||
      view.getUint16(offset + 8, true) !== method ||
      view.getUint16(offset + 6, true) & 1
    )
      throw new Error("ZIP 本地条目损坏。");
    const payload =
      offset +
      30 +
      view.getUint16(offset + 26, true) +
      view.getUint16(offset + 28, true);
    if (payload + compressed > view.getUint32(end + 16, true))
      throw new Error("ZIP 数据已截断。");
    entries.push({ name, size, compressed, crc, offset, method });
    cursor = next;
  }
  return entries;
}
function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
export function extractZip(data: Uint8Array, selected?: string) {
  const entries = inspectZip(data),
    wanted = entries.filter(
      (entry) =>
        !entry.name.endsWith("/") && (!selected || entry.name === selected),
    );
  if (selected && !wanted.length) throw new Error("条目不存在。");
  return extractWanted(data, wanted);
}
/** Verify the archive once, then extract only the explicitly requested parts. */
export function extractZipEntries(data: Uint8Array, names: ReadonlySet<string>) {
  const entries = inspectZip(data), wanted = entries.filter((entry) => names.has(entry.name) && !entry.name.endsWith("/"));
  if (wanted.length !== names.size) throw new Error("请求的 ZIP 条目不存在或是目录。");
  return extractWanted(data, wanted);
}
function extractWanted(data: Uint8Array, wanted: ArchiveEntry[]) {
  const set = new Set(wanted.map((entry) => entry.name)),
    result = unzipSync(data, { filter: (entry) => set.has(entry.name) });
  for (const entry of wanted) {
    if (
      !result[entry.name] ||
      result[entry.name].length !== entry.size ||
      crc32(result[entry.name]) !== entry.crc
    )
      throw new Error(`文件校验失败：${entry.name}`);
  }
  return result;
}
export function packZip(entries: { name: string; data: Uint8Array }[]) {
  if (
    entries.length > toolLimits.archive.entries ||
    entries.reduce((sum, entry) => sum + entry.data.length, 0) > MAX_BATCH_BYTES
  )
    throw new Error("最多 2000 个文件，总大小不超过 512 MB。");
  const files: Record<string, Uint8Array> = Object.create(null),
    used = new Set<string>();
  for (const entry of entries) {
    validateArchivePath(entry.name);
    if (
      used.has(entry.name) ||
      ["__proto__", "constructor", "prototype"].includes(entry.name)
    )
      throw new Error("ZIP 文件名重复或为保留名称。");
    used.add(entry.name);
    files[entry.name] = entry.data;
  }
  return zipSync(files, { level: 6 });
}
