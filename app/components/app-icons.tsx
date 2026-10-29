"use client";
/* eslint-disable @next/next/no-img-element -- Local source thumbnail and generated PNG Blob previews. */
import { useState } from "react";
import { appIconNeedsUpscale, appIconPlatforms, defaultAppIcons, planAppIcons, renderAppIcons, type AppIconOptions, type AppIconResult } from "../lib/app-icons";
import { prepareCanvasSource, type CanvasImageSource } from "../lib/image-canvas";
import { DesignColorInput } from "./design-color-input";
import { LocalDownload, LocalUpload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";

const platformNames = { web: "Web / PWA", apple: "Apple", android: "Android 传统图标" };
function IconPreview({ icon }: { icon: AppIconResult }) {
  const url = useBlobUrl(icon.blob);
  return <figure className="app-icon-result"><figcaption>{icon.label}<span>{icon.size} × {icon.size}px</span></figcaption><div className="app-icon-preview">{url && <img src={url} alt={`${icon.label}实际 PNG 成品`} width={icon.size} height={icon.size} />}</div><LocalDownload blob={icon.blob} name={icon.platform === "android" ? `ic_launcher-${icon.size}.png` : icon.path.split("/").at(-1)!} title="下载 PNG" /></figure>;
}

export default function AppIcons() {
  const [options, setOptions] = useState<AppIconOptions>({ ...defaultAppIcons, platforms: [...defaultAppIcons.platforms] }), [uploadKey, setUploadKey] = useState(0);
  const source = useLocalTask<CanvasImageSource>(), output = useLocalTask<Awaited<ReturnType<typeof renderAppIcons>>>();
  const current = source.result, original = useBlobUrl(current?.thumbnail);
  function change(next: Partial<AppIconOptions>) { output.reset(); setOptions({ ...options, ...next }); }
  let planned: ReturnType<typeof planAppIcons> = [], problem = "";
  try { planned = planAppIcons(options); } catch (cause) { problem = cause instanceof Error ? cause.message : "设置无效。"; }
  return <UtilityShell className="additional-utilities app-icons-tool" title="多尺寸应用图标" description="一次生成 Web / PWA、Apple 与 Android 传统图标，预览尺寸、单张下载或打包 ZIP；图片不上传。">
    <LocalUpload key={uploadKey} accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,.png,.jpg,.jpeg,.webp,.avif,.bmp" title="选择图标原图" hint="静态 PNG / JPG / WebP / AVIF / BMP · 最大 100 MiB / 100 MP · 不支持动画或 SVG" onFiles={async (files) => { output.reset(); await source.run((signal) => prepareCanvasSource(files[0], signal)); }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>生成设置</h2>
      <fieldset><legend>目标平台</legend><div className="utility-actions">{appIconPlatforms.map((platform) => <label className="utility-checkbox" key={platform}><input type="checkbox" checked={options.platforms.includes(platform)} onChange={(event) => change({ platforms: event.target.checked ? [...options.platforms, platform] : options.platforms.filter((item) => item !== platform) })} />{platformNames[platform]}</label>)}</div></fieldset>
      <label>应用名称<input value={options.name} maxLength={80} onChange={(event) => change({ name: event.target.value })} /></label>
      <label>图片适配<select value={options.fit} onChange={(event) => change({ fit: event.target.value as AppIconOptions["fit"] })}><option value="contain">完整适配 · 保留全部画面</option><option value="cover">填满裁切 · 裁掉超出部分</option></select></label>
      <label>每侧内边距（%）<input type="number" min="0" max="35" step="1" value={options.padding} onChange={(event) => change({ padding: Number(event.target.value) })} /></label>
      <label className="utility-checkbox"><input type="checkbox" checked={options.transparent} onChange={(event) => change({ transparent: event.target.checked })} />Web / Android 保留透明背景</label>
      <DesignColorInput label={options.platforms.includes("apple") ? "背景色（Apple 始终使用）" : "背景色"} value={options.background} onChange={(background) => change({ background })} />
      <p className="utility-muted">Apple 180 / 1024px 图标始终合成为无透明通道的 RGB PNG，不预加圆角。透明选项只影响 Web 与 Android。</p>
      <p className="utility-muted">Android 为传统 mipmap 位图，不是 adaptive 图标。iOS 1024px 为普通 PNG，不包含 Icon Composer 分层或完整商店提交素材。</p>
      {current && <dl className="workbench-details"><dt>原图尺寸</dt><dd>{current.width} × {current.height}px</dd><dt>导出数量</dt><dd>{planned.length} 张 PNG</dd></dl>}
      {current && !problem && appIconNeedsUpscale(current.width, current.height, options) && <p className="utility-muted">部分图标会放大原图，可能变模糊。建议使用高清正方形原图。</p>}
      {problem && <p className="utility-error" role="alert">{problem}</p>}
      <div className="utility-actions"><button type="button" className="primary-button" disabled={!current || source.busy || output.busy || !!problem} onClick={() => current && output.run((signal, report) => renderAppIcons(current.file, options, signal, report))}>生成图标</button><button type="button" disabled={!current && !source.busy} onClick={() => { source.reset(); output.reset(); setUploadKey((key) => key + 1); }}>清空图片</button><button type="button" onClick={() => { output.reset(); setOptions({ ...defaultAppIcons, platforms: [...defaultAppIcons.platforms] }); }}>重置设置</button></div><TaskFeedback task={output} />
      {output.result && <LocalDownload blob={output.result.zip} name="app-icons.zip" title="下载全部 ZIP" />}
    </section><section className="utility-panel utility-controls"><h2>图标预览</h2>
      {original && <figure className="app-icon-source"><figcaption>原图缩略预览</figcaption><img src={original} alt="应用图标原图缩略图" /></figure>}
      <p className="utility-muted">修改设置后重新生成。预览按界面缩放，下载保留标注尺寸；棋盘格仅表示透明区域，不会导出。</p>
      {output.result ? <><div className="app-icon-results">{output.result.icons.map((icon) => <IconPreview icon={icon} key={icon.path} />)}</div><p className="utility-muted">ZIP 附相对路径 manifest 与使用说明。清单仅含名称和图标，需要合并网站自身的启动路径等设置；不是完整可安装 PWA。</p></> : <div className="utility-empty">导入原图、选择平台后点击“生成图标”</div>}
    </section></div>
  </UtilityShell>;
}
