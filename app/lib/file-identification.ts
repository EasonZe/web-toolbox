import { fileTypeFromBuffer } from "file-type";
import { toolLimits } from "./resource-limits";
export type FileIdentification = { name: string; size: number; declared: string; detected: string; extension: string; sampleBytes: number; status: "match" | "mismatch" | "container" | "unknown" | "no-extension"; hex: string; note: string };
const aliases: Record<string, string> = { jpeg: "jpg", jpe: "jpg", tif: "tiff", oga: "ogg", ogv: "ogg", ogx: "ogg", m4v: "mp4", mpa: "mp3", wave: "wav", htm: "html", tgz: "gz", gzip: "gz" };
const normalize = (ext: string) => aliases[ext.toLowerCase()] ?? ext.toLowerCase();
export async function identifyFile(file: File, signal: AbortSignal): Promise<FileIdentification> {
  signal.throwIfAborted();
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("文件为空或大小无效。");
  const sample = new Uint8Array(await file.slice(0, toolLimits.fileIdentification.sampleBytes).arrayBuffer()); signal.throwIfAborted();
  const namedExtension = file.name.includes(".") ? file.name.split(".").at(-1)!.toLowerCase() : "";
  let detected: { ext: string; mime: string } | undefined, note = "文件头启发式识别，不保证文件完整、可打开或安全。", container = false;
  if (sample[0] === 0x50 && sample[1] === 0x4b && [[3, 4], [5, 6], [7, 8]].some(([a, b]) => sample[2] === a && sample[3] === b)) {
    detected = { ext: "zip", mime: "application/zip" }; container = /^(docx|xlsx|pptx|odt|ods|odp|epub|jar|apk|zip)$/i.test(namedExtension);
    note = "识别为 ZIP 容器，未解压内部内容，不能确认 Office / EPUB / APK 等子类型。";
  } else if (sample[0] === 0x1f && sample[1] === 0x8b) {
    detected = { ext: "gz", mime: "application/gzip" }; container = /^(gz|gzip|tgz|unitypackage)$/i.test(namedExtension);
    note = "识别为 GZIP 容器，未解压内部内容，不能确认压缩内容类型。";
  } else {
    try { detected = await fileTypeFromBuffer(sample); }
    catch { note = "样本过短、结构异常或超出识别范围，未根据文件名猜测类型。"; }
  }
  signal.throwIfAborted();
  const status = !detected ? "unknown" : container && !["zip", "gz", "gzip"].includes(namedExtension) ? "container" : !namedExtension ? "no-extension" : normalize(namedExtension) === normalize(detected.ext) ? "match" : "mismatch";
  if (!detected && note.startsWith("文件头")) note = "未识别文件头；纯文本、JSON、SVG、部分格式或截断文件可能没有受支持的二进制签名。";
  return { name: file.name, size: file.size, declared: file.type || "未提供", detected: detected?.mime ?? "未识别", extension: detected?.ext ?? "", sampleBytes: sample.length, status,
    hex: [...sample.subarray(0, 32)].map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" "), note };
}
export async function identifyFiles(files: File[], signal: AbortSignal, report: (progress: number, status: string) => void = () => {}) {
  if (!files.length || files.length > toolLimits.fileIdentification.files) throw new Error("请选择 1–200 个文件。");
  const results: (FileIdentification & { error?: string })[] = [];
  for (let i = 0; i < files.length; i++) {
    signal.throwIfAborted(); report(i / files.length * 95, `正在识别 ${i + 1} / ${files.length}`);
    try { results.push(await identifyFile(files[i], signal)); }
    catch (cause) { signal.throwIfAborted(); results.push({ name: files[i].name, size: files[i].size, declared: files[i].type || "未提供", detected: "未识别", extension: "", sampleBytes: 0, status: "unknown", hex: "", note: "此文件识别失败。", error: cause instanceof Error ? cause.message : "无法读取文件" }); }
  }
  return results;
}
