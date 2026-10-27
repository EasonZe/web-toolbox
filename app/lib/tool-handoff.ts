import { toolLimits } from "./resource-limits";

export const handoffTargets = {
  "/images-to-pdf": { label: "图片转 PDF", family: "image", files: toolLimits.image.batchFiles, bytes: toolLimits.image.batchBytes, extensions: /\.(png|jpe?g|webp|avif|bmp)$/i, types: /^(image\/(png|jpeg|webp|avif|bmp))?$/i },
  "/image-compressor": { label: "图片压缩", family: "image", files: toolLimits.image.batchFiles, bytes: toolLimits.image.batchBytes, extensions: /\.(png|jpe?g|webp)$/i, types: /^(image\/(png|jpeg|webp))?$/i },
  "/image-text": { label: "图片加文字", family: "image", files: 1, bytes: toolLimits.image.fileBytes, extensions: /\.(png|jpe?g|webp|avif|bmp|gif)$/i, types: /^(image\/(png|jpeg|webp|avif|bmp|gif))?$/i },
  "/pdf-page-numbers": { label: "PDF 加页码", family: "pdf", files: 1, bytes: toolLimits.document.fileBytes, extensions: /\.pdf$/i, types: /^(application\/pdf)?$/i },
  "/pdf-cropper": { label: "PDF 页面裁剪", family: "pdf", files: 1, bytes: toolLimits.document.fileBytes, extensions: /\.pdf$/i, types: /^(application\/pdf)?$/i },
} as const;
export type HandoffTarget = keyof typeof handoffTargets;
export type ToolHandoff = Readonly<{ id: number; target: HandoffTarget; source: string; files: readonly File[]; expiresAt: number }>;
export const handoffLifetimeMs = 5 * 60 * 1000;

/** A single pending transfer, file references only; never serialized or uploaded. */
export function createToolHandoffStore(clock: { now?: () => number; schedule?: typeof setTimeout; cancel?: typeof clearTimeout } = {}) {
  const now = clock.now ?? Date.now, schedule = clock.schedule ?? setTimeout, cancel = clock.cancel ?? clearTimeout;
  const listeners = new Set<() => void>();
  let pending: ToolHandoff | null = null, sequence = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => { for (const listener of listeners) listener(); };
  function discard(id: number) {
    if (pending?.id !== id) return false;
    pending = null; if (timer !== undefined) cancel(timer); timer = undefined; notify(); return true;
  }
  function peek(target: HandoffTarget, id: number) {
    if (pending && pending.expiresAt <= now()) discard(pending.id);
    return pending?.id === id && pending.target === target ? pending : null;
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => pending && pending.expiresAt > now() ? pending : null,
    peek, discard,
    clear() { if (pending) discard(pending.id); },
    offer(target: HandoffTarget, files: readonly File[], source: string) {
      if (!Object.hasOwn(handoffTargets, target)) throw new Error("不支持的继续处理目标。");
      const rule = handoffTargets[target];
      if (typeof source !== "string" || !source.trim() || source.length > 120) throw new Error("文件来源无效。");
      if (!Array.isArray(files) || !files.length || files.length > rule.files) throw new Error(`“${rule.label}”本次可接收 1–${rule.files} 个文件。`);
      if (files.some((file) => !(file instanceof File) || !Number.isSafeInteger(file.size) || file.size <= 0 || !rule.extensions.test(file.name) || !rule.types.test(file.type) || rule.family === "image" && file.size > toolLimits.image.fileBytes)) throw new Error(`结果的格式或大小不适合“${rule.label}”，请先下载后选择合适工具。`);
      if (files.reduce((sum, file) => sum + file.size, 0) > rule.bytes) throw new Error(`结果超过“${rule.label}”的接收容量，请分批处理。`);
      if (timer !== undefined) cancel(timer);
      const value = Object.freeze({ id: ++sequence, target, source: source.trim(), files: Object.freeze([...files]), expiresAt: now() + handoffLifetimeMs });
      pending = value;
      timer = schedule(() => discard(value.id), handoffLifetimeMs);
      notify(); return value;
    },
  };
}

let browserStore: ReturnType<typeof createToolHandoffStore> | undefined;
function getBrowserStore() {
  if (typeof window === "undefined") return;
  if (!browserStore) {
    browserStore = createToolHandoffStore();
    window.addEventListener("pagehide", () => browserStore?.clear());
  }
  return browserStore;
}
export const handoffSnapshot = () => typeof window === "undefined" ? null : browserStore?.snapshot() ?? null;
export const handoffServerSnapshot = () => null;
export const subscribeHandoff = (notify: () => void) => getBrowserStore()?.subscribe(notify) ?? (() => {});
export const peekHandoff = (target: HandoffTarget, id: number) => getBrowserStore()?.peek(target, id) ?? null;
export const discardHandoff = (id: number) => getBrowserStore()?.discard(id) ?? false;
export function offerHandoff(target: HandoffTarget, files: readonly File[], source: string) {
  const store = getBrowserStore();
  if (!store) throw new Error("继续处理只能在当前浏览器标签页使用。");
  return store.offer(target, files, source);
}

export function resultFile(blob: Blob, name: string, type = blob.type) {
  const leaf = name.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g, "_") || "result";
  const extension = leaf.match(/\.[a-z\d]{1,8}$/i)?.[0] ?? "";
  return new File([blob], `${leaf.slice(0, extension ? -extension.length : undefined).slice(0, 180)}${extension}`, { type });
}
