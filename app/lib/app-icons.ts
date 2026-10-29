import { loadRaster } from "./local-images";
import { checkRasterWork, toolLimits } from "./resource-limits";
import { inspectStaticRaster } from "./static-raster";
import { opaqueAppIconPng } from "./app-icons-png";

export const appIconPlatforms = ["web", "apple", "android"] as const;
export type AppIconPlatform = typeof appIconPlatforms[number];
export type AppIconOptions = {
  platforms: AppIconPlatform[];
  fit: "contain" | "cover";
  padding: number;
  transparent: boolean;
  background: string;
  name: string;
};
export const defaultAppIcons: AppIconOptions = { platforms: [...appIconPlatforms], fit: "contain", padding: 10, transparent: false, background: "#ffffff", name: "我的应用" };
export type AppIconSpec = { platform: AppIconPlatform; size: number; path: string; label: string; opaque: boolean };
export type AppIconResult = AppIconSpec & { blob: Blob };
const specs: readonly AppIconSpec[] = [
  { platform: "web", size: 192, path: "web/icons/icon-192.png", label: "Web / PWA 192", opaque: false },
  { platform: "web", size: 512, path: "web/icons/icon-512.png", label: "Web / PWA 512", opaque: false },
  { platform: "apple", size: 180, path: "apple/apple-touch-icon.png", label: "Apple Touch 180", opaque: true },
  { platform: "apple", size: 1024, path: "apple/ios-icon-1024.png", label: "iOS 普通 PNG 1024", opaque: true },
  ...([ ["mdpi", 48], ["hdpi", 72], ["xhdpi", 96], ["xxhdpi", 144], ["xxxhdpi", 192] ] as const).map(([density, size]) => ({ platform: "android" as const, size, path: `android/res/mipmap-${density}/ic_launcher.png`, label: `Android ${density}`, opaque: false })),
];

export function planAppIcons(options: AppIconOptions) {
  if (!Array.isArray(options.platforms) || !options.platforms.length || options.platforms.some((value) => !appIconPlatforms.includes(value)) || new Set(options.platforms).size !== options.platforms.length) throw new Error("请至少选择一个平台，且不要重复选择。");
  if (!["contain", "cover"].includes(options.fit) || !Number.isFinite(options.padding) || options.padding < 0 || options.padding > 35 || typeof options.transparent !== "boolean" || !/^#[\da-f]{6}$/i.test(options.background)) throw new Error("适配、内边距或背景颜色无效，内边距应为 0–35%。");
  if (typeof options.name !== "string" || !options.name.trim() || options.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(options.name)) throw new Error("应用名称应为 1–80 个字符，不含控制字符。");
  return specs.filter((spec) => options.platforms.includes(spec.platform));
}

export function appIconPlacement(width: number, height: number, size: number, options: AppIconOptions) {
  planAppIcons(options);
  if (![width, height, size].every((value) => Number.isSafeInteger(value) && value > 0) || width * height > toolLimits.image.pixels || size > 1024) throw new Error("图标或来源图片尺寸无效。");
  const inset = size * options.padding / 100, edge = size - 2 * inset;
  const scale = (options.fit === "contain" ? Math.min : Math.max)(edge / width, edge / height);
  return { x: (size - width * scale) / 2, y: (size - height * scale) / 2, width: width * scale, height: height * scale, inset, edge };
}

export function appIconNeedsUpscale(width: number, height: number, options: AppIconOptions) {
  return planAppIcons(options).some(({ size }) => appIconPlacement(width, height, size, options).width > width);
}

export function appIconManifest(options: AppIconOptions) {
  const icons = planAppIcons(options).filter((spec) => spec.platform === "web");
  return JSON.stringify({ name: options.name.trim(), short_name: options.name.trim(), icons: icons.map(({ path, size }) => ({ src: path.slice(4), sizes: `${size}x${size}`, type: "image/png", purpose: "any" })) }, null, 2) + "\n";
}

function readme(options: AppIconOptions, icons: readonly AppIconSpec[]) {
  return ["# 多尺寸应用图标", "", `应用名称：${options.name.trim()}`, `适配：${options.fit === "contain" ? "完整适配" : "填满裁切"}；每侧内边距：${options.padding}%。`, "", "## 文件", "", ...icons.map((icon) => `- ${icon.path} — ${icon.size} × ${icon.size}px${icon.opaque ? "，不透明背景" : ""}`), "", "## 使用说明", "", ...(options.platforms.includes("web") ? ["Web：将 web/ 中的 icons/ 与 manifest.webmanifest 保持相对位置，或按实际部署路径修改 src。", "manifest 仅提供名称和图标资源，不含猜测的 start_url、scope 或站点路径；请合并到现有清单并根据网站补齐，单独放置这些文件不能保证 PWA 可安装。", "Web 图标 purpose 为 any，不是 maskable 图标。", ""] : []), ...(options.platforms.includes("apple") ? ["Apple：两个 PNG 使用所选背景色合成为无透明通道的 RGB 图片，不预加圆角；180px 供 apple-touch-icon 使用，1024px 是普通平面 PNG。", 'HTML 引用示例（请按实际文件位置调整）：<link rel="apple-touch-icon" sizes="180x180" href="apple/apple-touch-icon.png">', "本工具不生成 Icon Composer 分层图标或完整 Xcode 资产目录，不代表已满足全部 App Store 提交要求。", ""] : []), ...(options.platforms.includes("android") ? ["Android：将 android/res/ 下各 mipmap 目录合并到项目 res/，在 AndroidManifest.xml 中按需引用 @mipmap/ic_launcher。", "这是传统（legacy）位图图标，不包含 adaptive 前景 / 背景、单色主题图层或 Google Play 商店图。现代 Android 应使用 Android Studio Image Asset Studio 补齐。", ""] : []), "较小来源会被放大，无法凭空恢复细节。请在目标设备上检查图标清晰度和裁切。", "", "规范参考：", "- https://web.dev/articles/add-manifest", "- https://developer.apple.com/design/human-interface-guidelines/app-icons/", "- https://developer.android.com/studio/write/create-app-icons", ""].join("\n");
}

async function png(canvas: HTMLCanvasElement, signal: AbortSignal) {
  signal.throwIfAborted();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 编码失败，请重试。")), "image/png"));
  signal.throwIfAborted();
  if (blob.type !== "image/png" || blob.size > toolLimits.image.fileBytes) throw new Error("PNG 导出格式无效或超过资源保护范围。");
  return blob;
}

export async function renderAppIcons(file: File, options: AppIconOptions, signal: AbortSignal, report: (progress: number, text: string) => void = () => {}) {
  const selected = planAppIcons(options), header = await inspectStaticRaster(file, signal), largest = Math.max(...selected.map((spec) => spec.size));
  // One decoded source plus one output/encoder and all small PNG previews.
  const outputPixels = selected.reduce((sum, spec) => sum + spec.size ** 2, 0);
  const budget = (width: number, height: number) => checkRasterWork(width, height, 1 + (3 * largest ** 2 + outputPixels) / (width * height));
  if (header.width && header.height) budget(header.width, header.height);
  signal.throwIfAborted();
  const image = await loadRaster(file, signal);
  const icons: AppIconResult[] = [];
  let canvas: HTMLCanvasElement | undefined;
  try {
    budget(image.width, image.height);
    canvas = document.createElement("canvas");
    for (const [index, spec] of selected.entries()) {
      signal.throwIfAborted();
      canvas.width = canvas.height = spec.size;
      const context = canvas.getContext("2d"); if (!context) throw new Error("当前浏览器无法创建画布。");
      if (spec.opaque || !options.transparent) { context.fillStyle = options.background; context.fillRect(0, 0, spec.size, spec.size); }
      const placement = appIconPlacement(image.width, image.height, spec.size, options);
      context.save(); context.beginPath(); context.rect(placement.inset, placement.inset, placement.edge, placement.edge); context.clip();
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
      context.drawImage(image, placement.x, placement.y, placement.width, placement.height); context.restore();
      icons.push({ ...spec, blob: spec.opaque ? await opaqueAppIconPng(context, spec.size, signal) : await png(canvas, signal) });
      report(Math.round((index + 1) / selected.length * 85), `已生成 ${index + 1} / ${selected.length} 张图标`);
      // Yield between outputs so cancellation and setting changes can be handled.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    const { strToU8, zipSync } = await import("fflate");
    const entries: Record<string, Uint8Array> = {};
    for (const icon of icons) { entries[icon.path] = new Uint8Array(await icon.blob.arrayBuffer()); signal.throwIfAborted(); }
    entries["README.txt"] = strToU8(readme(options, selected));
    if (options.platforms.includes("web")) entries["web/manifest.webmanifest"] = strToU8(appIconManifest(options));
    signal.throwIfAborted(); report(95, "正在打包图标与说明");
    // PNG is already compressed; store entries instead of recompressing on the UI thread.
    const zip = new Blob([new Uint8Array(zipSync(entries, { level: 0 }))], { type: "application/zip" });
    signal.throwIfAborted();
    return { icons, zip, sourceWidth: image.width, sourceHeight: image.height, enlarged: appIconNeedsUpscale(image.width, image.height, options) };
  } finally { image.close(); if (canvas) canvas.width = canvas.height = 1; }
}
