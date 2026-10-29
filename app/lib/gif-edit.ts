import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { checkGifEditWorkspace, gifEditOutputBudget, validateGifEditOptions, type GifEditOptions, type GifEditResult } from "./gif-edit-options";

type EncoderOptions = { palette: number[][]; first: boolean; delay: number; repeat: number; dispose: number; transparent: boolean; transparentIndex: number };
// The existing project's gifenc declaration omits documented manual/alpha APIs.
type FrameEncoder = { writeHeader(): void; writeFrame(index: Uint8Array, width: number, height: number, options: EncoderOptions): void; bytesView(): Uint8Array<ArrayBuffer> };
const createFrameEncoder = GIFEncoder as unknown as (options: { auto: boolean }) => FrameEncoder;

export function indexGifEditPixels(rgba: Uint8ClampedArray) {
  if (!rgba.length || rgba.length % 4) throw new Error("GIF 编辑像素数据无效。");
  const colors = new Map<number, number>(), exact: number[][] = [];
  let overflow = false;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] !== 0 && rgba[i + 3] !== 255) throw new Error("编辑帧应来自 GIF 完整帧，不支持半透明像素。");
    if (!rgba[i + 3]) continue;
    const key = rgba[i] << 16 | rgba[i + 1] << 8 | rgba[i + 2];
    if (!colors.has(key)) {
      if (exact.length < 255) { exact.push([rgba[i], rgba[i + 1], rgba[i + 2]]); colors.set(key, exact.length); }
      else overflow = true;
    }
  }
  // Reserve index 0 in EVERY frame, including opaque ones, so disposal 2 can
  // reliably clear a full canvas before the next complete transparent frame.
  const opaque = overflow ? quantize(rgba, 255) : exact;
  const palette = [[0, 0, 0], ...(opaque.length ? opaque : [[0, 0, 0]])];
  const index = overflow ? applyPalette(rgba, opaque) : new Uint8Array(rgba.length / 4);
  for (let i = 0, pixel = 0; i < rgba.length; i += 4, pixel++) {
    if (!rgba[i + 3]) index[pixel] = 0;
    else index[pixel] = overflow ? index[pixel] + 1 : colors.get(rgba[i] << 16 | rgba[i + 1] << 8 | rgba[i + 2])!;
  }
  return { palette, index, quantized: overflow };
}

export async function editGifFrames(options: GifEditOptions, signal: AbortSignal, report: (progress: number, status: string) => void = () => {}): Promise<GifEditResult> {
  signal.throwIfAborted(); const inputBytes = validateGifEditOptions(options);
  checkGifEditWorkspace(options.width, options.height, inputBytes, 0);
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") throw new Error("当前浏览器不支持后台 GIF 编辑，请使用新版浏览器。");
  const canvas = new OffscreenCanvas(options.width, options.height), parts: Blob[] = [];
  let outputBytes = 0, quantizedFrames = 0;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("无法创建 GIF 编辑画布。");
    for (let i = 0; i < options.frames.length; i++) {
      signal.throwIfAborted(); checkGifEditWorkspace(options.width, options.height, inputBytes, outputBytes);
      const source = options.frames[i], bitmap = await createImageBitmap(source.blob);
      try {
        signal.throwIfAborted();
        if (bitmap.width !== options.width || bitmap.height !== options.height) throw new Error("编辑帧尺寸与原 GIF 不一致。");
        context.clearRect(0, 0, options.width, options.height); context.drawImage(bitmap, 0, 0);
      } finally { bitmap.close(); }
      const rgba = context.getImageData(0, 0, options.width, options.height).data;
      const mapped = indexGifEditPixels(rgba); signal.throwIfAborted();
      const encoder = createFrameEncoder({ auto: false });
      if (!i) encoder.writeHeader();
      encoder.writeFrame(mapped.index, options.width, options.height, { first: i === 0, palette: mapped.palette, delay: source.delay, repeat: options.repeat, dispose: 2, transparent: true, transparentIndex: 0 });
      const bytes = encoder.bytesView(); outputBytes += bytes.byteLength;
      if (outputBytes + 1 > gifEditOutputBudget()) throw new Error("生成的 GIF 超过当前设备输出预算，请减少帧数。");
      checkGifEditWorkspace(options.width, options.height, inputBytes, outputBytes);
      // Each frame has an independent bounded encoder. Blob parts avoid a single
      // growing animation buffer and a final whole-output Uint8Array copy.
      parts.push(new Blob([bytes], { type: "image/gif" }));
      quantizedFrames += Number(mapped.quantized);
      report((i + 1) / options.frames.length * 95, `正在编码第 ${i + 1} / ${options.frames.length} 帧`);
      signal.throwIfAborted();
    }
    const blob = new Blob([...parts, new Uint8Array([0x3b])], { type: "image/gif" }); signal.throwIfAborted();
    return { blob, width: options.width, height: options.height, frames: options.frames.length, duration: options.frames.reduce((sum, frame) => sum + frame.delay, 0), repeat: options.repeat, quantizedFrames };
  } finally { canvas.width = canvas.height = 0; }
}
