"use client";
/* eslint-disable @next/next/no-img-element -- Current-frame previews use local Blob URLs, not server images. */
import { useEffect, useRef, useState } from "react";
import type { GifExtractOptions, GifExtractResult, GifInfo } from "../lib/gif-extract";
import { moveGifRow, parseGifDelay, type GifEditResult, type GifTimelineRow } from "../lib/gif-edit-options";
import { runFileWorker } from "../lib/file-worker-client";
import { fileSize } from "../lib/local-files";
import { UtilityShell } from "./utility-shell";
import { LocalDownload, LocalUpload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";

export default function GifExtract() {
  const [file, setFile] = useState<File | null>(null), [info, setInfo] = useState<GifInfo | null>(null);
  const [start, setStart] = useState("1"), [end, setEnd] = useState("1"), [step, setStep] = useState("1"), [background, setBackground] = useState<GifExtractOptions["background"]>("transparent"), [selected, setSelected] = useState(0);
  const inspection = useLocalTask<GifInfo>(), task = useLocalTask<GifExtractResult>();
  const editor = useLocalTask<GifEditResult>();
  const [timeline, setTimeline] = useState<GifTimelineRow[]>([]), [timelinePage, setTimelinePage] = useState(0), [uniformDelay, setUniformDelay] = useState("100"), [loop, setLoop] = useState("forever"), [repeat, setRepeat] = useState("1");
  const generation = useRef(0), [uploadKey, setUploadKey] = useState(0);
  useEffect(() => () => { generation.current++; }, []);
  const frame = task.result?.images[selected], url = useBlobUrl(frame?.blob);
  const editedUrl = useBlobUrl(editor.result?.blob);
  function resetResult() { task.reset(); editor.reset(); setTimeline([]); setTimelinePage(0); setSelected(0); }
  function updateTimeline(update: (current: GifTimelineRow[]) => GifTimelineRow[]) { editor.reset(); setTimeline(update); }
  function restoreTimeline() {
    editor.reset(); setTimelinePage(0);
    setTimeline(task.result?.images.map((image) => ({ frame: image.frame, delay: String(image.delay), included: true })) ?? []);
  }
  async function extract() {
    if (!file) return;
    const job = generation.current; editor.reset(); setTimeline([]); setTimelinePage(0); setSelected(0);
    const value = await task.run((signal, report) => runFileWorker<GifExtractResult>({ action: "gif-extract", file, options: { start: Number(start), end: Number(end), step: Number(step), background } }, signal, report));
    if (value && job === generation.current) setTimeline(value.images.map((image) => ({ frame: image.frame, delay: String(image.delay), included: true })));
  }
  function exportEditedGif() {
    const result = task.result;
    if (!result) return;
    void editor.run((signal, report) => {
      if (loop === "finite" && (!/^\d+$/.test(repeat) || Number(repeat) < 1 || Number(repeat) > 65535)) throw new Error("有限循环计数须为 1–65535 的整数。");
      const sources = new Map(result.images.map((image) => [image.frame, image]));
      const frames = timeline.filter((row) => row.included).map((row) => ({ frame: row.frame, delay: parseGifDelay(row.delay), blob: sources.get(row.frame)!.blob }));
      return import("../lib/gif-edit-worker-client").then(({ runGifEdit }) => runGifEdit({ width: result.width, height: result.height, repeat: loop === "once" ? -1 : loop === "forever" ? 0 : Number(repeat), frames }, signal, report));
    });
  }
  async function choose(files: File[]) {
    const job = ++generation.current;
    resetResult(); inspection.reset(); setFile(null); setInfo(null);
    if (!files[0]) return;
    const next = files[0];
    const value = await inspection.run((signal) => runFileWorker<GifInfo>({ action: "gif-inspect", file: next }, signal));
    // useLocalTask returns no value for a cancelled or superseded inspection.
    if (!value || job !== generation.current) return;
    setFile(next); setInfo(value); setStart("1"); setEnd(String(value.frames)); setStep(String(Math.max(1, Math.ceil(value.frames / 200)))); setSelected(0);
  }
  return <UtilityShell className="additional-utilities" title="GIF 拆帧与编辑" description="还原完整画面，下载 PNG；选择、删除和重排帧，调整延迟与循环后导出 GIF。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>动图与范围</h2>
      <LocalUpload key={uploadKey} accept=".gif,image/gif" title="选择 GIF / 拖入文件" hint="本地解析 GIF87a / GIF89a，不上传文件。" onFiles={choose} />
      <TaskFeedback task={inspection} />
      {file && info && <p className="utility-muted">{file.name} · {fileSize(file.size)} · {info.width} × {info.height} · {info.frames} 帧 · 标称总时长 {(info.duration / 1000).toFixed(2)} 秒</p>}
      <div className="gif-extract-range">{([["起始帧", start, setStart], ["结束帧", end, setEnd], ["每隔几帧提取", step, setStep]] as const).map(([label, value, update]) => <label key={label}>{label}<input type="number" inputMode="numeric" min={1} max={info?.frames ?? 2000} step={1} value={value} onChange={(e) => { resetResult(); update(e.target.value); }} /></label>)}</div>
      <label>背景处理<select value={background} onChange={(e) => { resetResult(); setBackground(e.target.value as GifExtractOptions["background"]); }}><option value="transparent">透明背景</option><option value="file">使用 GIF 文件背景色</option></select></label>
      <div className="utility-actions"><button type="button" className="primary-button" disabled={!file || task.busy || inspection.busy} onClick={extract}>提取 PNG 帧</button><button type="button" onClick={() => { generation.current++; setUploadKey((value) => value + 1); resetResult(); inspection.reset(); setFile(null); setInfo(null); }}>清空</button></div>
      <TaskFeedback task={task} />
      <p className="utility-muted">即使跳帧导出，也会先顺序还原前面的画面。清除模式支持保留、恢复背景和恢复前一画面；“透明背景”会将文件背景替换为透明，并非保留所有原始背景像素。</p>
      <p className="utility-muted">保留 GIF 标称帧延迟（包括 0），不模拟播放器的最短延迟策略；ZIP 内含 frames.json。最多读取 2000 帧、一次导出 200 帧，按画布像素与设备检查工作量；不会自动缩小输出。纯文本绘制扩展不支持。</p>
    </section><section className="utility-panel"><h2>帧预览与下载</h2>{task.result && frame ? <>
      <p className="utility-muted" role="status">已提取 {task.result.images.length} 帧 · 原尺寸 {task.result.width} × {task.result.height}</p>
      <div className="utility-actions"><LocalDownload blob={task.result.zip} name="gif-frames.zip" title="下载全部 PNG（ZIP）" /><LocalDownload blob={frame.blob} name={frame.name} title="下载当前帧" /></div>
      {url && <img className="gif-frame-preview" src={url} alt={`GIF 第 ${frame.frame} 帧完整画面`} width={task.result.width} height={task.result.height} />}
      <div className="utility-actions"><button type="button" disabled={selected === 0} onClick={() => setSelected((value) => Math.max(0, value - 1))}>上一帧</button><button type="button" disabled={selected >= task.result.images.length - 1} onClick={() => setSelected((value) => Math.min(task.result!.images.length - 1, value + 1))}>下一帧</button><span className="utility-muted">第 {frame.frame} 帧 · 标称 {frame.delay} ms</span></div>
      <label className="gif-frame-picker">选择已提取帧<select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>{task.result.images.map((image, index) => <option key={image.frame} value={index}>第 {image.frame} 帧（{image.delay} ms）</option>)}</select></label>
    </> : <p className="utility-muted">提取后预览完整画面。仅加载当前帧预览，切换、清空和离开页面会释放预览链接。</p>}</section></div>
    {task.result && <section className="utility-panel utility-controls gif-edit-controls"><h2>编辑时间轴</h2>
      <p className="utility-muted">仅编辑上方已经提取的完整帧，最多 200 帧。勾选的帧按下方顺序导出；不合并被删除帧的时长，跳帧也不自动补时。修改顺序、延迟或循环不重新解析原 GIF。</p>
      <div className="utility-actions"><button type="button" onClick={() => updateTimeline((rows) => rows.map((row) => ({ ...row, included: true })))}>全选</button><button type="button" onClick={() => updateTimeline((rows) => rows.map((row) => ({ ...row, included: false })))}>全不选</button><button type="button" onClick={restoreTimeline}>恢复提取时的帧序与延迟</button></div>
      <div className="gif-edit-settings"><label>统一延迟（ms）<input type="number" min={0} max={655350} step={10} value={uniformDelay} onChange={(event) => setUniformDelay(event.target.value)} /></label><button type="button" onClick={() => {
        editor.reset();
        try { const delay = parseGifDelay(uniformDelay); setTimeline((rows) => rows.map((row) => row.included ? { ...row, delay: String(delay) } : row)); }
        catch (cause) { editor.setError(cause instanceof Error ? cause.message : "延迟无效。"); }
      }}>应用到勾选帧</button><label>循环<select value={loop} onChange={(event) => { editor.reset(); setLoop(event.target.value); }}><option value="forever">无限循环</option><option value="once">仅播放一次</option><option value="finite">有限循环（扩展计数）</option></select></label>{loop === "finite" && <label>循环扩展计数<input type="number" min={1} max={65535} step={1} value={repeat} onChange={(event) => { editor.reset(); setRepeat(event.target.value); }} /></label>}</div>
      <p className="utility-muted">GIF 延迟按 10 ms 存储，原始 0 ms 保留；手动延迟不自动取整。播放器可能强制最短延迟，有限循环按 Netscape 扩展计数写入，不保证各播放器行为完全一致。</p>
      <ol className="gif-edit-timeline" aria-label="GIF 编辑帧列表">{timeline.slice(timelinePage * 20, timelinePage * 20 + 20).map((row, offset) => {
        const index = timelinePage * 20 + offset;
        return <li className="gif-edit-row" key={row.frame}>
          <label className="gif-edit-checkbox"><input type="checkbox" checked={row.included} aria-label={`导出原第 ${row.frame} 帧`} onChange={(event) => updateTimeline((rows) => rows.map((item) => item.frame === row.frame ? { ...item, included: event.target.checked } : item))} />{index + 1}</label>
          <button type="button" onClick={() => setSelected(task.result!.images.findIndex((image) => image.frame === row.frame))}>预览原第 {row.frame} 帧</button>
          <label>延迟（ms）<input type="number" min={0} max={655350} step={10} value={row.delay} aria-label={`原第 ${row.frame} 帧延迟（ms）`} onChange={(event) => updateTimeline((rows) => rows.map((item) => item.frame === row.frame ? { ...item, delay: event.target.value } : item))} /></label>
          <div className="utility-actions"><button type="button" disabled={index === 0} aria-label={`上移原第 ${row.frame} 帧`} onClick={() => updateTimeline((rows) => moveGifRow(rows, index, -1))}>上移</button><button type="button" disabled={index === timeline.length - 1} aria-label={`下移原第 ${row.frame} 帧`} onClick={() => updateTimeline((rows) => moveGifRow(rows, index, 1))}>下移</button><button type="button" aria-label={`删除原第 ${row.frame} 帧`} onClick={() => { updateTimeline((rows) => rows.filter((item) => item.frame !== row.frame)); setTimelinePage(0); }}>删除</button></div>
        </li>;
      })}</ol>
      {timeline.length > 20 && <div className="utility-actions"><button type="button" disabled={!timelinePage} onClick={() => setTimelinePage((page) => Math.max(0, page - 1))}>上一页帧</button><span className="utility-muted">第 {timelinePage + 1} / {Math.ceil(timeline.length / 20)} 页</span><button type="button" disabled={(timelinePage + 1) * 20 >= timeline.length} onClick={() => setTimelinePage((page) => page + 1)}>下一页帧</button></div>}
      <div className="utility-actions"><button type="button" className="primary-button" disabled={editor.busy || task.busy || !timeline.some((row) => row.included)} onClick={exportEditedGif}>导出编辑 GIF</button><span className="utility-muted">勾选 {timeline.filter((row) => row.included).length} / {timeline.length} 帧</span></div>
      <TaskFeedback task={editor} />
      <p className="utility-muted">导出会重新编码，逐帧最多 255 个不透明颜色加一个透明色；超过时量化，可能改变色彩，不是无损裁切。完整帧独立编码保留透明区域；原注释、应用扩展及原循环设置不保留，以这里的循环设置为准。</p>
      {editor.result && <div className="gif-edit-result"><LocalDownload blob={editor.result.blob} name="edited.gif" title="下载编辑后的 GIF" /><p className="utility-muted" role="status">{editor.result.frames} 帧 · 标称总时长 {(editor.result.duration / 1000).toFixed(2)} 秒 · {fileSize(editor.result.blob.size)} · {editor.result.quantizedFrames} 帧使用颜色量化</p>{editedUrl && <img className="gif-frame-preview" src={editedUrl} alt="编辑后的 GIF 动画预览" width={editor.result.width} height={editor.result.height} />}</div>}
    </section>}
  </UtilityShell>;
}
