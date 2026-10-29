import { toolLimits } from "./resource-limits";
export function validateDuplicateFiles(files: readonly File[]) {
  if (files.length < 2 || files.length > toolLimits.archive.entries) throw new Error("请选择 2–2000 个文件。");
  let total = 0;
  for (const file of files) {
    total += file.size;
    if (!Number.isSafeInteger(file.size) || file.size < 0 || !Number.isSafeInteger(total) || typeof file.slice !== "function") throw new Error("文件大小或读取方式无效。");
  }
}
