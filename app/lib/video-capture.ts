import { Zip, ZipPassThrough } from "fflate";
import { toolLimits, checkRasterWork, isConstrainedDevice } from "./resource-limits";
import { validateVideoConversionFile } from "./video-conversion";
type MediaLoader = () => Promise<typeof import("mediabunny")>;
export type VideoCaptureInfo = { duration: number; start: number; width: number; height: number; canDecode: boolean };
export function captureTimes(start: number, end: number, count: number, duration: number) {
  if (![start, end, count, duration].every(Number.isFinite) || duration <= 0 || start < 0 || start >= duration || end < start || end > duration || !Number.isInteger(count) || count < 1 || count > toolLimits.frameCapture.frames || (count > 1 && end === start)) throw new Error("请检查取帧区间与数量；单次最多 200 张。");
  const last = Math.min(end, Math.max(start, duration - Math.min(0.001, duration / 1000)));
  return Array.from({ length: count }, (_, index) => count === 1 ? start : start + (last - start) * index / (count - 1));
}
export function captureDimensions(width: number, height: number, edge: number) {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0) || ![0, 640, 1280, 1920, 3840].includes(edge)) throw new Error("视频尺寸或输出尺寸无效。");
  const scale = edge === 0 ? 1 : Math.min(1, edge / Math.max(width, height));
  const result = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  if (result.width > toolLimits.raster.edge || result.height > toolLimits.raster.edge) throw new Error("原视频尺寸超过画布范围，请选择较小的输出尺寸。");
  checkRasterWork(result.width, result.height, 3); return result;
}
async function open(file: File, signal: AbortSignal, load: MediaLoader) {
  const error = validateVideoConversionFile(file); if (error) throw new Error(error);
  signal.throwIfAborted(); const media = await load(); signal.throwIfAborted();
  const input = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS });
  const abort = () => input.dispose(); signal.addEventListener("abort", abort, { once: true });
  const close = () => { signal.removeEventListener("abort", abort); input.dispose(); };
  try {
    const track = await input.getPrimaryVideoTrack(); signal.throwIfAborted();
    if (!track) throw new Error("文件中没有视频轨道。");
    const [first, end, width, height, canDecode] = await Promise.all([track.getFirstTimestamp(), track.computeDuration(), track.getDisplayWidth(), track.getDisplayHeight(), track.canDecode()]);
    signal.throwIfAborted(); const start = Math.max(0, first), duration = end - start;
    if (![first, end, width, height].every(Number.isFinite) || duration <= 0) throw new Error("无法读取有效的视频时长与尺寸。");
    return { media, track, info: { duration, start, width, height, canDecode }, close };
  } catch (cause) { close(); throw cause; }
}
export async function inspectCaptureVideo(file: File, signal: AbortSignal, load: MediaLoader = () => import("mediabunny")): Promise<VideoCaptureInfo> {
  const session = await open(file, signal, load); try { return session.info; } finally { session.close(); }
}
export async function captureVideo(file: File, options: { start: number; end: number; count: number; edge: number; format: "png" | "jpeg" }, signal: AbortSignal, report: (progress: number) => void, load: MediaLoader = () => import("mediabunny")) {
  const session = await open(file, signal, load), chunks: Uint8Array[] = [];
  let zipError: Error | null = null, outputBytes = 0, completed = false;
  const zip = new Zip((error, chunk, final) => { if (error) zipError = error; else { chunks.push(chunk); outputBytes += chunk.length; completed = final; } });
  try {
    if (!session.info.canDecode) throw new Error("浏览器无法解码此视频，请先用视频格式转换工具转换为受支持的 MP4 / WebM。");
    if (!["png", "jpeg"].includes(options.format)) throw new Error("请选择 PNG 或 JPEG。");
    const times = captureTimes(options.start, options.end, options.count, session.info.duration), dimensions = captureDimensions(session.info.width, session.info.height, options.edge);
    const sink = new session.media.CanvasSink(session.track, { ...dimensions, fit: "contain", poolSize: 1 });
    const mime = options.format === "png" ? "image/png" : "image/jpeg", extension = options.format === "png" ? "png" : "jpg";
    const budget = toolLimits.frameCapture.bytes / (isConstrainedDevice() ? 2 : 1), manifest = ["index,requested_seconds,actual_seconds"];
    let count = 0, first: Blob | null = null, bytes = 0;
    for await (const frame of sink.canvasesAtTimestamps(times.map((time) => time + session.info.start))) {
      signal.throwIfAborted(); if (!frame) throw new Error("指定位置没有可解码的视频帧。");
      const canvas = frame.canvas;
      const blob = "convertToBlob" in canvas ? await canvas.convertToBlob({ type: mime, quality: 0.92 }) : await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("截图导出失败。")), mime, 0.92));
      signal.throwIfAborted(); bytes += blob.size;
      if (bytes > budget) throw new Error("截图总量超过本设备输出预算，请减少数量或降低输出尺寸。");
      first ??= blob;
      const name = `frame-${String(count + 1).padStart(3, "0")}-${times[count].toFixed(3)}s.${extension}`;
      manifest.push(`${count + 1},${times[count].toFixed(6)},${Math.max(0, frame.timestamp - session.info.start).toFixed(6)}`);
      if (times.length > 1) { const entry = new ZipPassThrough(name); zip.add(entry); entry.push(new Uint8Array(await blob.arrayBuffer()), true); }
      count++; report(Math.round(count / times.length * 95)); if (zipError) throw zipError;
    }
    if (!first || count !== times.length) throw new Error("视频取帧不完整，未返回部分结果。");
    if (count === 1) return { blob: first, preview: first, count, name: `frame-${times[0].toFixed(3)}s.${extension}`, ...dimensions };
    const index = new ZipPassThrough("frames.csv"); zip.add(index); index.push(new TextEncoder().encode(manifest.join("\n")), true); zip.end();
    if (zipError) throw zipError;
    if (!completed || outputBytes > budget + 1024 * 1024) throw new Error("截图打包未完成或超过输出预算。");
    signal.throwIfAborted(); return { blob: new Blob(chunks as BlobPart[], { type: "application/zip" }), preview: first, count, name: "video-frames.zip", ...dimensions };
  } finally { zip.terminate(); session.close(); }
}
