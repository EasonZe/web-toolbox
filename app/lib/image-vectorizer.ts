import { SaxesParser } from "saxes";
import { loadRaster } from "./local-images";
import { inspectStaticRaster } from "./static-raster";
import { checkRasterWork, isConstrainedDevice, toolLimits } from "./resource-limits";
import { validateImageVectorizer, vectorizerDimensions, vectorizerLimits, type ImageVectorizerOptions } from "./image-vectorizer-options";

type Report = (progress: number, status: string) => void;
type Color = { r: number; g: number; b: number; a: number };
type SafePath = { d: string; fill: string; opacity: number };
export type ImageVectorizerSource = { thumbnail: Blob; width: number; height: number };
export type ImageVectorizerResult = { blob: Blob; width: number; height: number; sourceWidth: number; sourceHeight: number; scale: number; paths: number; segments: number; transparent: boolean };

export function checkImageVectorizerWork(sourceWidth: number, sourceHeight: number, width: number, height: number, constrained = false) {
  if (typeof constrained !== "boolean" || ![sourceWidth, sourceHeight, width, height].every((n) => Number.isSafeInteger(n) && n > 0) || Math.max(sourceWidth, sourceHeight) > toolLimits.raster.edge || sourceWidth * sourceHeight > toolLimits.image.pixels || Math.max(width, height) > 2048 || width > sourceWidth || height > sourceHeight) throw new Error("图片尺寸无效；原图单边最多 8192px，处理最长边最多 2048px。");
  // Sequential ImageTracer uses JS number grids, edge nodes and fitted paths, not
  // only RGBA arrays. Reserve 256 bytes/working pixel, a decoded source and SVG.
  const bytes = sourceWidth * sourceHeight * 4 + width * height * 256 + vectorizerLimits.bytes;
  checkRasterWork(sourceWidth, sourceHeight, 1);
  if (bytes > (constrained || isConstrainedDevice() ? 512 : 2048) * 1024 * 1024) throw new Error("所选处理尺寸超出此设备的矢量描摹内存预算，请手动选择更小的处理最长边；不会自动降低尺寸。");
  return bytes;
}

/** Accept only the path-only dialect emitted by our locked ImageTracer options. */
export function readSafeVectorPaths(svg: string): SafePath[] {
  if (typeof svg !== "string" || svg.length > vectorizerLimits.bytes || new TextEncoder().encode(svg).byteLength > vectorizerLimits.bytes) throw new Error("SVG 超过 8 MiB，请减少颜色、提高过滤或减小处理尺寸。");
  const paths: SafePath[] = [], stack: string[] = [], parser = new SaxesParser({ xmlns: true });
  let root = false;
  const fail = () => { throw new Error("矢量引擎返回了不安全或无效的 SVG，已停止导出。"); };
  parser.on("error", fail);
  for (const event of ["doctype", "xmldecl", "processinginstruction", "comment", "cdata"] as const) parser.on(event, fail);
  parser.on("text", (text) => { if (text.trim()) fail(); });
  parser.on("opentag", (tag) => {
    if (tag.uri !== "http://www.w3.org/2000/svg" || tag.prefix || !["svg", "path"].includes(tag.local)) fail();
    const attrs = Object.fromEntries(Object.values(tag.attributes).map((attribute) => [attribute.name, attribute.value]));
    if (tag.local === "svg") {
      if (root || stack.length || Object.keys(attrs).some((name) => !["xmlns", "version", "viewBox", "width", "height", "desc"].includes(name)) || attrs.xmlns !== "http://www.w3.org/2000/svg" || attrs.version !== "1.1" || attrs.viewBox && !/^0 0 \d+ \d+$/.test(attrs.viewBox) || attrs.width && !/^\d+$/.test(attrs.width) || attrs.height && !/^\d+$/.test(attrs.height) || attrs.desc && !/^Created with imagetracer\.js version 1\.2\.6$/.test(attrs.desc)) fail();
      root = true;
    } else {
      if (stack.length !== 1 || stack[0] !== "svg" || Object.keys(attrs).some((name) => !["fill", "stroke", "stroke-width", "opacity", "d"].includes(name)) || attrs.stroke !== attrs.fill || attrs["stroke-width"] !== "0" || !/^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/.test(attrs.fill ?? "") || !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(attrs.opacity ?? "") || !attrs.d || !/^[MLQZ\d.\s-]+$/.test(attrs.d) || !/^M\s/.test(attrs.d) || !/Z\s*$/.test(attrs.d)) fail();
      const rgb = attrs.fill.match(/\d+/g)!, coordinates = attrs.d.match(/-?(?:\d*\.)?\d+/g) ?? [];
      if (rgb.some((n) => Number(n) > 255) || coordinates.some((n) => !Number.isFinite(Number(n)) || Math.abs(Number(n)) > 32768) || paths.length >= vectorizerLimits.paths) fail();
      paths.push({ d: attrs.d, fill: attrs.fill, opacity: Number(attrs.opacity) });
    }
    stack.push(tag.local);
  });
  parser.on("closetag", () => { stack.pop(); });
  parser.write(svg).close(); if (!root) fail(); return paths;
}

function paletteFor(pixels: Uint8ClampedArray, colors: number) {
  const bins = new Map<number, { count: number; color: Color }>();
  for (let at = 0; at < pixels.length; at += 4) {
    const r = pixels[at], g = pixels[at + 1], b = pixels[at + 2], a = pixels[at + 3], key = (r >> 5) * 512 + (g >> 5) * 64 + (b >> 5) * 8 + (a >> 5);
    const bin = bins.get(key); if (bin) bin.count++; else bins.set(key, { count: 1, color: { r, g, b, a } });
  }
  // Ensure a small visible shape is not missed by a grid sample on transparent
  // icons. ImageTracer still performs its own deterministic RGBA clustering.
  return [...bins.values()].sort((a, b) => b.count - a.count).slice(0, colors).map((bin) => bin.color);
}

function complexity(pixels: Uint8ClampedArray, width: number, height: number, constrained: boolean, signal?: AbortSignal) {
  let edges = 0; const budget = constrained || isConstrainedDevice() ? 375000 : 750000;
  const differs = (at: number, previous: number) => (pixels[at] >> 5) !== (pixels[previous] >> 5) || (pixels[at + 1] >> 5) !== (pixels[previous + 1] >> 5) || (pixels[at + 2] >> 5) !== (pixels[previous + 2] >> 5) || (pixels[at + 3] >> 5) !== (pixels[previous + 3] >> 5);
  for (let y = 0; y < height; y++) { signal?.throwIfAborted(); for (let x = 0; x < width; x++) { const at = (y * width + x) * 4; if (x && differs(at, at - 4)) edges++; if (y && differs(at, at - width * 4)) edges++; if (edges > budget) throw new Error("图片边缘过于复杂，请手动减小处理尺寸；照片和细密纹理不适合直接描摹为大量矢量路径。"); } }
}

/** Synchronous library calls run only in the disposable worker in production. */
export async function traceVectorizerPixels(input: Uint8ClampedArray, width: number, height: number, options: ImageVectorizerOptions, signal?: AbortSignal, report?: Report, constrained = false) {
  validateImageVectorizer(options); checkImageVectorizerWork(width, height, width, height, constrained); signal?.throwIfAborted();
  if (!(input instanceof Uint8ClampedArray) || input.length !== width * height * 4 || Math.max(width, height) > options.edge) throw new Error("图片像素或所选处理尺寸无效。");
  const pixels = input.slice(); let transparent = false, visible = false;
  for (let at = 0; at < pixels.length; at += 4) {
    const alpha = pixels[at + 3]; visible ||= alpha > 0; transparent ||= alpha === 0;
    if (options.background === "white") { for (let c = 0; c < 3; c++) pixels[at + c] = Math.round(pixels[at + c] * alpha / 255 + 255 - alpha); pixels[at + 3] = 255; }
    else if (alpha === 0) pixels[at] = pixels[at + 1] = pixels[at + 2] = 0;
  }
  if (!visible && options.background === "transparent") throw new Error("图片完全透明，没有可描摹的可见内容。");
  complexity(pixels, width, height, constrained, signal); report?.(15, "正在加载矢量描摹引擎…");
  const tracer = (await import("imagetracerjs")).default; signal?.throwIfAborted();
  const config = { ltres: options.fitting, qtres: options.fitting, pathomit: options.speckles, rightangleenhance: true, colorsampling: 2, numberofcolors: options.colors, mincolorratio: 0, colorquantcycles: 3, layering: 0, strokewidth: 0, linefilter: false, scale: 1, roundcoords: 2, viewbox: true, desc: false, lcpr: 0, qcpr: 0, blurradius: 0, pal: paletteFor(pixels, options.colors) };
  let segments = 0, tracedPaths = 0;
  const inspect = (data: ReturnType<typeof tracer.imagedataToTracedata>) => {
    for (const layer of data.layers) for (const path of layer) {
      tracedPaths++; segments += path.segments.length;
      if (tracedPaths > vectorizerLimits.paths || segments > vectorizerLimits.segments) throw new Error("描摹路径过多，请减少颜色、提高小斑点过滤或减小处理尺寸。");
    }
    return readSafeVectorPaths(tracer.getsvgstring(data, config));
  };
  report?.(25, "正在量化颜色与拟合矢量路径…");
  const data = tracer.imagedataToTracedata({ data: pixels, width, height }, config); signal?.throwIfAborted();
  const paths = inspect(data).filter((path) => path.opacity > 0);
  let clip = "";
  if (transparent && options.background === "transparent") {
    report?.(75, "正在描摹透明背景与镂空区域…");
    const mask = new Uint8ClampedArray(pixels.length);
    for (let at = 0; at < pixels.length; at += 4) { const value = input[at + 3] > 0 ? 255 : 0; mask[at] = mask[at + 1] = mask[at + 2] = value; mask[at + 3] = 255; }
    const maskConfig = { ...config, pathomit: 0, colorquantcycles: 1, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }] };
    const maskData = tracer.imagedataToTracedata({ data: mask, width, height }, maskConfig); signal?.throwIfAborted();
    // Black paths are outside the visible shape and must not enter the clip.
    maskData.layers[0] = [];
    clip = inspect(maskData).map((path) => `<path d="${path.d}"/>`).join("");
  }
  const body = paths.map((path) => `<path fill="${path.fill}" opacity="${path.opacity}" d="${path.d}"/>`).join("");
  // Only numeric path/color values from the XML allowlist enter this wrapper.
  // The single URL is our fixed local fragment; no raster, script or external URL.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${clip ? `<defs><clipPath id="alpha">${clip}</clipPath></defs><g clip-path="url(#alpha)">${body}</g>` : body}</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  if (blob.size > vectorizerLimits.bytes) throw new Error("SVG 超过 8 MiB，请减少颜色、提高过滤或减小处理尺寸。");
  signal?.throwIfAborted(); report?.(95, "SVG 安全校验完成…");
  return { blob, paths: paths.length, segments, transparent: options.background === "transparent" };
}

async function bitmapFor(file: File, signal: AbortSignal, edge: number, constrained: boolean) {
  signal.throwIfAborted(); const header = await inspectStaticRaster(file, signal);
  if (header.width && header.height) { const dimensions = vectorizerDimensions(header.width, header.height, edge); checkImageVectorizerWork(header.width, header.height, dimensions.width, dimensions.height, constrained); }
  const bitmap = await loadRaster(file, signal);
  try { const dimensions = vectorizerDimensions(bitmap.width, bitmap.height, edge); checkImageVectorizerWork(bitmap.width, bitmap.height, dimensions.width, dimensions.height, constrained); return bitmap; } catch (cause) { bitmap.close(); throw cause; }
}
export async function prepareImageVectorizerSource(file: File, signal: AbortSignal, constrained = false): Promise<ImageVectorizerSource> {
  if (typeof OffscreenCanvas === "undefined") throw new Error("当前浏览器不支持后台图像处理，请使用新版浏览器。");
  const bitmap = await bitmapFor(file, signal, 512, constrained), size = vectorizerDimensions(bitmap.width, bitmap.height, 512); let canvas: OffscreenCanvas | undefined;
  try { canvas = new OffscreenCanvas(size.width, size.height); const context = canvas.getContext("2d"); if (!context) throw new Error("无法创建图片预览。"); context.drawImage(bitmap, 0, 0, size.width, size.height); const thumbnail = await canvas.convertToBlob({ type: "image/png" }); signal.throwIfAborted(); return { thumbnail, width: bitmap.width, height: bitmap.height }; }
  finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 1; }
}
export async function processImageVectorizer(file: File, options: ImageVectorizerOptions, signal: AbortSignal, report?: Report, constrained = false): Promise<ImageVectorizerResult> {
  validateImageVectorizer(options);
  if (typeof OffscreenCanvas === "undefined") throw new Error("当前浏览器不支持后台图像处理，请使用新版浏览器。");
  const bitmap = await bitmapFor(file, signal, options.edge, constrained), size = vectorizerDimensions(bitmap.width, bitmap.height, options.edge); let canvas: OffscreenCanvas | undefined;
  try { canvas = new OffscreenCanvas(size.width, size.height); const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("无法读取图片像素。"); context.drawImage(bitmap, 0, 0, size.width, size.height); const raw = context.getImageData(0, 0, size.width, size.height), result = await traceVectorizerPixels(raw.data, size.width, size.height, options, signal, report, constrained); signal.throwIfAborted(); return { ...result, width: size.width, height: size.height, sourceWidth: bitmap.width, sourceHeight: bitmap.height, scale: size.scale }; }
  finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 1; }
}
