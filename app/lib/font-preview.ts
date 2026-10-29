import { isConstrainedDevice, toolLimits } from "./resource-limits";

export type FontFileInfo = { name: string; size: number; decodedBytes: number; format: "TTF" | "OTF" | "WOFF" | "WOFF2" };
export type FontPreviewEntry = FontFileInfo & { id: string; family: string };
export function validateFontFiles(files: readonly File[]) {
  if (!files.length || files.length > toolLimits.fontPreview.files) throw new Error(`请选择 1–${toolLimits.fontPreview.files} 个字体文件，未截断选择。`);
  let total = 0;
  for (const file of files) {
    if (!/\.(ttf|otf|woff|woff2)$/iu.test(file.name)) throw new Error(`不支持的字体文件：${file.name}。请选择 TTF、OTF、WOFF 或 WOFF2；不支持 TTC 字体集合。`);
    if (!Number.isSafeInteger(file.size) || file.size < 12 || file.size > toolLimits.fontPreview.fileBytes) throw new Error("字体文件为空、过小或超过 64 MiB，请分批选择或使用字体子集。原文件不变。");
    total += file.size;
  }
  if (total > toolLimits.fontPreview.batchBytes) throw new Error("本批字体原始数据超过 128 MiB，请分批预览；未截断或压缩输入。");
}

/** Validates the container header before passing bytes to the browser's font parser. */
export function inspectFontHeader(bytes: Uint8Array, file: { name: string; size: number }): FontFileInfo {
  if (bytes.byteLength < 12) throw new Error("字体头不完整，无法确认文件格式。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  let format: FontFileInfo["format"], decodedBytes = file.size;
  if (signature === "ttcf") throw new Error("暂不支持 TTC / OTC 字体集合，请选择单独的 TTF、OTF、WOFF 或 WOFF2 文件。");
  if (signature === "wOFF" || signature === "wOF2") {
    format = signature === "wOFF" ? "WOFF" : "WOFF2";
    const minimum = format === "WOFF" ? 44 : 48;
    if (bytes.byteLength < minimum || view.getUint32(8) !== file.size || view.getUint16(14) !== 0) throw new Error("WOFF 字体头或声明长度无效。");
    const flavor = String.fromCharCode(...bytes.subarray(4, 8));
    if (flavor === "ttcf") throw new Error("暂不支持压缩字体集合，请选择单独的字体文件。");
    if (view.getUint32(4) !== 0x00010000 && flavor !== "OTTO" && flavor !== "true") throw new Error("WOFF 内部字体类型无效。");
    const tables = view.getUint16(12); decodedBytes = view.getUint32(16);
    if (!tables || decodedBytes < 12 + 16 * tables || decodedBytes % 4 !== 0) throw new Error("WOFF 字体声明的表数量或解压长度无效。");
  } else if (view.getUint32(0) === 0x00010000 || signature === "true" || signature === "OTTO") {
    format = signature === "OTTO" ? "OTF" : "TTF";
    const tables = view.getUint16(4);
    if (!tables || 12 + 16 * tables > file.size) throw new Error("字体表目录不完整。");
  } else throw new Error("文件内容不是支持的字体格式；不按扩展名假定加载成功。");
  if (decodedBytes > toolLimits.fontPreview.decodedFileBytes) throw new Error("字体声明的解压数据超过 128 MiB，已在浏览器解码前停止。");
  return { name: file.name, size: file.size, decodedBytes, format };
}

export function fontDecodedBudget() { return isConstrainedDevice() ? toolLimits.fontPreview.decodedBytes / 2 : toolLimits.fontPreview.decodedBytes; }
export function fontPreviewSettings(size: string, weight: string) {
  const pixels = Number(size), numericWeight = Number(weight);
  if (!size.trim() || !Number.isFinite(pixels) || pixels < 8 || pixels > 160) throw new Error("预览字号须为 8–160 px。");
  if (!/^\d{3}$/u.test(weight) || !Number.isInteger(numericWeight) || numericWeight < 100 || numericWeight > 900) throw new Error("预览字重须为 100–900 的整数。");
  return { pixels, weight: numericWeight };
}

type PreviewFace = { load: () => Promise<unknown> };
export type FontPreviewEnvironment = { createFace: (family: string, buffer: ArrayBuffer) => PreviewFace; add: (face: PreviewFace) => void; remove: (face: PreviewFace) => void };
function nativeFontEnvironment(): FontPreviewEnvironment {
  if (typeof FontFace !== "function" || typeof document === "undefined" || !document.fonts?.add || !document.fonts?.delete) throw new Error("当前浏览器不支持本地 FontFace 预览，请使用支持 CSS Font Loading API 的浏览器。");
  return {
    createFace: (family, buffer) => new FontFace(family, buffer, { weight: "100 900", display: "swap" }),
    add: (face) => { document.fonts.add(face as FontFace); },
    remove: (face) => { document.fonts.delete(face as FontFace); },
  };
}
function waitForFont<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(signal.reason ?? new DOMException("已取消字体加载。", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (cause) => { cleanup(); reject(cause); });
  });
}
let fontSequence = 0;
/** One page-owned batch. No object URL, remote font URL, installation, or system-font enumeration. */
export function createFontPreviewSession(environment?: FontPreviewEnvironment) {
  const host = environment ?? nativeFontEnvironment(), controller = new AbortController(), faces = new Set<PreviewFace>();
  let started = false, disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; controller.abort();
    for (const face of faces) host.remove(face);
    faces.clear();
  };
  return {
    dispose,
    async load(files: readonly File[], signal: AbortSignal, report: (progress: number, status: string) => void = () => {}): Promise<FontPreviewEntry[]> {
      if (started || disposed) throw new Error("字体加载会话已结束，请重新选择文件。");
      started = true;
      const abort = () => dispose();
      signal.throwIfAborted(); signal.addEventListener("abort", abort, { once: true });
      try {
        validateFontFiles(files);
        const infos: FontFileInfo[] = []; let decodedBytes = 0;
        for (const file of files) {
          const header = new Uint8Array(await waitForFont(file.slice(0, 48).arrayBuffer(), controller.signal));
          controller.signal.throwIfAborted(); const info = inspectFontHeader(header, file); decodedBytes += info.decodedBytes;
          if (decodedBytes > fontDecodedBudget()) throw new Error("本批字体声明的解压数据超过当前设备预算，请减少字体数量后重试；未截断选择。");
          infos.push(info);
        }
        const entries: FontPreviewEntry[] = [];
        for (let index = 0; index < files.length; index++) {
          controller.signal.throwIfAborted();
          const buffer = await waitForFont(files[index].arrayBuffer(), controller.signal); controller.signal.throwIfAborted();
          if (buffer.byteLength !== files[index].size) throw new Error("字体读取长度与文件不一致，请重新选择。");
          const family = `toolbox-local-font-${++fontSequence}`, face = host.createFace(family, buffer);
          await waitForFont(face.load(), controller.signal); controller.signal.throwIfAborted();
          faces.add(face); host.add(face);
          entries.push({ ...infos[index], id: family, family });
          report((index + 1) / files.length * 100, `已加载 ${index + 1} / ${files.length} 个字体。`);
        }
        return entries;
      } catch (cause) { dispose(); throw cause; }
      finally { signal.removeEventListener("abort", abort); }
    },
  };
}
