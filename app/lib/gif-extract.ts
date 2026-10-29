import { decompressFrame, parseGIF } from "gifuct-js";
import { zipSync, strToU8 } from "fflate";
import { checkFiles } from "./local-files";
import { validateGifLzw } from "./gif-lzw-validation";
import { checkGifWork, checkRasterWork, isConstrainedDevice, toolLimits } from "./resource-limits";

export type GifExtractOptions = { start: number; end: number; step: number; background: "transparent" | "file" };
type FrameInfo = { start: number; end: number; left: number; top: number; width: number; height: number; gce: Uint8Array; delay: number; disposal: number };
export type GifInfo = { width: number; height: number; frames: number; duration: number };
export type GifExtractResult = GifInfo & { images: { frame: number; delay: number; blob: Blob; name: string }[]; zip: Blob };

// Validate block boundaries and work size BEFORE a decoder can allocate pixel arrays.
export function inspectGifBytes(bytes: Uint8Array) {
  let pos = 0;
  const need = (size: number) => { if (pos + size > bytes.length) throw new Error("GIF 数据截断或块长度损坏。"); };
  need(13);
  const header = String.fromCharCode(...bytes.subarray(0, 6));
  if (!["GIF87a", "GIF89a"].includes(header)) throw new Error("文件不是 GIF87a / GIF89a 图片。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), width = view.getUint16(6, true), height = view.getUint16(8, true);
  if (!width || !height || width > toolLimits.raster.edge || height > toolLimits.raster.edge) throw new Error("GIF 画布无效或单边超过 8192px。");
  checkRasterWork(width, height, 8);
  pos = 13;
  const paletteBytes = bytes[10] & 128 ? 3 * (2 ** ((bytes[10] & 7) + 1)) : 0;
  need(paletteBytes); pos += paletteBytes;
  const prefix = pos, frames: FrameInfo[] = [];
  let gce = new Uint8Array([0x21, 0xf9, 4, 0, 0, 0, 0, 0]), duration = 0, blocks = 0;
  let validationCodesRemaining = toolLimits.gif.workPixels / (isConstrainedDevice() ? 2 : 1);
  function subBlocks() { let size: number; do { need(1); size = bytes[pos++]; need(size); pos += size; } while (size); }
  while (pos < bytes.length) {
    if (++blocks > toolLimits.structured.nodes) throw new Error("GIF 数据块过多。");
    const start = pos, kind = bytes[pos++];
    if (kind === 0x3b) {
      if (!frames.length || pos !== bytes.length) throw new Error("GIF 没有图像帧或尾部有额外数据。");
      return { width, height, frames, duration, prefix, background: paletteBytes && bytes[11] * 3 < paletteBytes ? [...bytes.subarray(13 + bytes[11] * 3, 16 + bytes[11] * 3), 255] : [0, 0, 0, 0] };
    }
    if (kind === 0x21) {
      need(1); const label = bytes[pos++];
      if (label === 0xf9) {
        need(6);
        if (bytes[pos] !== 4 || bytes[pos + 5] !== 0 || (bytes[pos + 1] >> 2 & 7) > 3 || (bytes[pos + 1] & 2)) throw new Error("GIF 控制块无效，或使用了不支持的清除 / 用户输入模式。");
        gce = bytes.slice(start, pos + 6); pos += 6;
      } else if (label === 0xff) { need(1); if (bytes[pos] !== 11) throw new Error("GIF 应用扩展无效。"); subBlocks(); }
      else if (label === 0xfe) subBlocks();
      else throw new Error("此 GIF 包含不支持的扩展（如纯文本绘制），无法准确提取画面。");
      continue;
    }
    if (kind !== 0x2c) throw new Error("GIF 包含未知数据块。");
    need(9);
    const left = view.getUint16(pos, true), top = view.getUint16(pos + 2, true), w = view.getUint16(pos + 4, true), h = view.getUint16(pos + 6, true), packed = bytes[pos + 8];
    if (!w || !h || left + w > width || top + h > height) throw new Error("GIF 局部帧超出画布或尺寸无效。");
    pos += 9;
    const localPalette = packed & 128 ? 3 * 2 ** ((packed & 7) + 1) : 0;
    if (!localPalette && !paletteBytes) throw new Error("GIF 帧缺少调色板。");
    need(localPalette); pos += localPalette; need(1);
    const codeSize = bytes[pos++]; if (codeSize < 2 || codeSize > 8) throw new Error("GIF LZW 编码尺寸无效。");
    const dataStart = pos;
    subBlocks();
    validationCodesRemaining -= validateGifLzw(bytes, dataStart, pos, codeSize, w * h, validationCodesRemaining).codes;
    const delay = gce[4] | gce[5] << 8;
    frames.push({ start, end: pos, left, top, width: w, height: h, gce, delay: delay * 10, disposal: gce[3] >> 2 & 7 });
    if (frames.length > toolLimits.gifExtract.frames) throw new Error("GIF 超过 2000 帧，请先分段。");
    duration += delay * 10; gce = new Uint8Array([0x21, 0xf9, 4, 0, 0, 0, 0, 0]);
  }
  throw new Error("GIF 缺少结束标记。");
}

export function compositeGifPatch(canvas: Uint8ClampedArray, width: number, info: Pick<FrameInfo, "left" | "top" | "width" | "height">, patch: Uint8ClampedArray) {
  if (!Number.isSafeInteger(width) || width < 1 || canvas.length % (width * 4) || ![info.left, info.top, info.width, info.height].every(Number.isSafeInteger) || info.left < 0 || info.top < 0 || info.width < 1 || info.height < 1 || info.left + info.width > width || info.top + info.height > canvas.length / (width * 4) || patch.length !== info.width * info.height * 4) throw new Error("GIF 帧像素或边界无效。");
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const from = (y * info.width + x) * 4, to = ((y + info.top) * width + x + info.left) * 4;
    if (patch[from + 3]) canvas.set(patch.subarray(from, from + 4), to);
  }
}
async function readGif(file: File, signal: AbortSignal) {
  signal.throwIfAborted(); checkFiles([file], toolLimits.image.fileBytes, 1);
  const bytes = new Uint8Array(await file.arrayBuffer()); signal.throwIfAborted();
  return { bytes, info: inspectGifBytes(bytes) };
}
export async function inspectGif(file: File, signal: AbortSignal): Promise<GifInfo> {
  const { info } = await readGif(file, signal);
  return { width: info.width, height: info.height, frames: info.frames.length, duration: info.duration };
}
export async function extractGif(file: File, options: GifExtractOptions, signal: AbortSignal, report: (progress: number, status: string) => void = () => {}): Promise<GifExtractResult> {
  const { bytes, info } = await readGif(file, signal), { width, height } = info;
  if (![options.start, options.end, options.step].every(Number.isSafeInteger) || options.start < 1 || options.end < options.start || options.end > info.frames.length || options.step < 1 || !["transparent", "file"].includes(options.background)) throw new Error("帧范围、间隔或背景设置无效。");
  const count = Math.floor((options.end - options.start) / options.step) + 1;
  if (count > toolLimits.gifExtract.outputs) throw new Error("一次最多导出 200 帧，请增加间隔或缩小范围。");
  checkGifWork(width, height, options.end);
  if (typeof OffscreenCanvas === "undefined") throw new Error("当前浏览器不支持后台 PNG 导出，请使用新版浏览器。");
  const canvas = new OffscreenCanvas(width, height), pixels = new Uint8ClampedArray(width * height * 4), background = options.background === "file" ? info.background : [0, 0, 0, 0];
  const fill = (area: Pick<FrameInfo, "left" | "top" | "width" | "height">) => { for (let y = area.top; y < area.top + area.height; y++) for (let x = area.left; x < area.left + area.width; x++) pixels.set(background, (y * width + x) * 4); };
  const images: GifExtractResult["images"] = [], entries: Record<string, Uint8Array> = Object.create(null);
  const maxBytes = toolLimits.archive.expandedBytes / (isConstrainedDevice() ? 4 : 2);
  let outputBytes = 0;
  try {
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("无法生成 PNG 画布。");
    fill({ left: 0, top: 0, width, height });
    for (let index = 0; index < options.end; index++) {
      signal.throwIfAborted(); const frame = info.frames[index], saved = frame.disposal === 3 ? pixels.slice() : null;
      // Decode one normalized image block, keeping its GCE even when comments/apps intervened.
      const input = new Uint8Array(info.prefix + 8 + frame.end - frame.start + 1);
      input.set(bytes.subarray(0, info.prefix)); input.set(frame.gce, info.prefix); input.set(bytes.subarray(frame.start, frame.end), info.prefix + 8); input[input.length - 1] = 0x3b;
      const parsed = parseGIF(input.buffer), source = parsed.frames.find((item) => "image" in item);
      if (!source || !("image" in source)) throw new Error("GIF 帧解码失败。");
      const decoded = decompressFrame(source, parsed.gct, true);
      if (decoded.pixels.some((value) => value !== decoded.transparentIndex && !decoded.colorTable[value])) throw new Error("GIF 帧包含无效调色板索引。");
      compositeGifPatch(pixels, width, frame, decoded.patch);
      if (index + 1 >= options.start && (index + 1 - options.start) % options.step === 0) {
        ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
        const blob = await canvas.convertToBlob({ type: "image/png" }); signal.throwIfAborted();
        outputBytes += blob.size;
        if (outputBytes > maxBytes) throw new Error("PNG 与打包结果超过当前设备输出预算，请缩小范围。");
        const name = `frame-${String(index + 1).padStart(4, "0")}.png`;
        entries[name] = new Uint8Array(await blob.arrayBuffer()); signal.throwIfAborted();
        images.push({ frame: index + 1, delay: frame.delay, blob, name });
      }
      // Disposal applies AFTER displaying this frame, and only to its rectangle.
      if (frame.disposal === 2) fill(frame); else if (saved) pixels.set(saved);
      report((index + 1) / options.end * 95, `正在处理第 ${index + 1} / ${options.end} 帧`);
    }
    entries["frames.json"] = strToU8(JSON.stringify({ width, height, sourceFrames: info.frames.length, background: options.background, images: images.map(({ frame, delay, name }) => ({ frame, delayMs: delay, name })) }, null, 2));
    signal.throwIfAborted(); const zip = new Blob([zipSync(entries, { level: 0 }) as Uint8Array<ArrayBuffer>], { type: "application/zip" }); signal.throwIfAborted();
    return { width, height, frames: info.frames.length, duration: info.duration, images, zip };
  } finally { canvas.width = canvas.height = 0; }
}
