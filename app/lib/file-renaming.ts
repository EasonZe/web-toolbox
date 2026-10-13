import { safeName } from "./local-files";
export type RenameOptions = {
  prefix: string;
  suffix: string;
  find: string;
  replace: string;
  sequence: boolean;
  start: number;
  digits: number;
  date: string;
  dateSource: "none" | "custom" | "modified";
};
export const defaultRenameOptions: RenameOptions = {
  prefix: "",
  suffix: "",
  find: "",
  replace: "",
  sequence: true,
  start: 1,
  digits: 3,
  date: "",
  dateSource: "none",
};
export function planFileNames(
  files: { name: string; lastModified: number }[],
  options: RenameOptions,
) {
  if (
    !Number.isInteger(options.start) ||
    options.start < 0 ||
    options.start > 1_000_000 ||
    !Number.isInteger(options.digits) ||
    options.digits < 1 ||
    options.digits > 8
  )
    throw new Error("序号起点须为 0–1000000，位数须为 1–8。");
  const used = new Set<string>();
  return files.map((file, index) => {
    const dot = file.name.lastIndexOf("."),
      hasExt = dot > 0;
    let stem = hasExt ? file.name.slice(0, dot) : file.name;
    if (options.find) stem = stem.split(options.find).join(options.replace);
    let date = "";
    if (options.dateSource === "custom") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(options.date) ||
        Number.isNaN(Date.parse(options.date)) ||
        new Date(options.date).toISOString().slice(0, 10) !== options.date
      )
        throw new Error("请选择有效的日期。");
      date = options.date.replaceAll("-", "");
    }
    if (options.dateSource === "modified") {
      const d = new Date(file.lastModified);
      if (Number.isNaN(d.getTime())) throw new Error("文件修改日期无效。");
      date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    }
    const extension = hasExt
      ? safeName(`file${file.name.slice(dot)}`).slice(4)
      : "";
    const encoder = new TextEncoder(),
      budget = 240 - encoder.encode(extension).length;
    if (budget < 10) throw new Error("扩展名过长，请先调整原文件名称。");
    const base = safeName(
      `${options.prefix}${date ? `${date}_` : ""}${options.sequence ? `${String(options.start + index).padStart(options.digits, "0")}_` : ""}${stem}${options.suffix}`,
    );
    let truncated = "",
      bytes = 0;
    for (const character of base) {
      const size = encoder.encode(character).length;
      if (bytes + size > budget) break;
      truncated += character;
      bytes += size;
    }
    const name = `${truncated}${extension}`;
    const key = name.toLocaleLowerCase();
    if (used.has(key))
      throw new Error(
        `重命名后出现重复文件名：${name}。请启用序号或调整规则。`,
      );
    used.add(key);
    return name;
  });
}
