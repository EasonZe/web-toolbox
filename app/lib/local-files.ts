import { toolLimits } from "./resource-limits";
export const MAX_BATCH_BYTES = toolLimits.archive.expandedBytes;
export function checkFiles(
  files: readonly { name: string; size: number }[],
  maxBytes: number = MAX_BATCH_BYTES,
  count: number = toolLimits.archive.entries,
) {
  if (!files.length || files.length > count)
    throw new Error(`请选择 1–${count} 个文件。`);
  if (
    files.some((file) => file.size > maxBytes) ||
    files.reduce((sum, file) => sum + file.size, 0) > maxBytes
  )
    throw new Error(
      `文件总大小不能超过 ${Math.round(maxBytes / 1048576)} MB。`,
    );
}
export function safeName(name: string) {
  const normalized = name
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  const value = [...normalized].slice(0, 180).join("");
  if (!value || value === "." || value === "..")
    throw new Error("文件名不能为空。");
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)
    ? `_${value}`
    : value;
}
export function validateArchivePath(name: string) {
  if (
    !name ||
    name.length > 500 ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /[\u0000-\u001f:]/.test(name) ||
    name.split("/").some((part) => part === ".." || part === ".")
  )
    throw new Error("ZIP 包含不安全的路径，已拒绝解压。");
  return name;
}
export function downloadLocal(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = safeName(name);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function fileSize(bytes: number) {
  return bytes < 1048576
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1048576).toFixed(2)} MB`;
}
export async function readTextFile(file: File, extensions?: RegExp) {
  checkFiles([file], toolLimits.text.fileBytes, 1);
  if (extensions && !extensions.test(file.name))
    throw new Error("请选择支持的文本文件。");
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(await file.arrayBuffer())
      .replace(/^\uFEFF/, "");
  } catch {
    throw new Error("请选择 UTF-8 编码的文本文件。");
  }
}
