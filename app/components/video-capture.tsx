"use client";
/* eslint-disable @next/next/no-img-element -- Local video screenshot Blob preview. */
import { useState } from "react";
import { inspectCaptureVideo, captureVideo, type VideoCaptureInfo } from "../lib/video-capture";
import { toolLimits } from "../lib/resource-limits";
import { LocalUpload, LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";
export default function VideoCapture() {
  const [start, setStart] = useState(0), [end, setEnd] = useState(0), [count, setCount] = useState(1), [edge, setEdge] = useState(1920), [format, setFormat] = useState<"png" | "jpeg">("png");
  const source = useLocalTask<{ file: File; info: VideoCaptureInfo }>(), task = useLocalTask<Awaited<ReturnType<typeof captureVideo>>>();
  const current = source.result, videoUrl = useBlobUrl(current?.file), screenshot = useBlobUrl(task.result?.preview);
  return <UtilityShell className="additional-utilities" title="视频截图与取帧" description="按时间截取视频画面，或在指定区间均匀取帧并打包下载。">
    <LocalUpload accept="video/*,.mp4,.webm,.mov,.mkv,.m4v" title="选择视频 / 拖入视频" hint="最多 2 GB · 格式支持取决于浏览器解码能力" onFiles={async (files) => {
      task.reset(); setStart(0); setEnd(0); const result = await source.run(async (signal) => ({ file: files[0], info: await inspectCaptureVideo(files[0], signal) })); if (result) setEnd(result.info.duration);
    }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>取帧设置</h2>
      {current && <p className="utility-muted">{current.info.width} × {current.info.height} · {current.info.duration.toFixed(3)} 秒</p>}
      <label>开始时间（秒）<input type="number" min="0" step="0.001" max={current?.info.duration} value={start} onChange={(e) => { task.reset(); setStart(Number(e.target.value)); }} /></label>
      <label>取帧数量<input type="number" min="1" max={toolLimits.frameCapture.frames} value={count} onChange={(e) => { task.reset(); setCount(Number(e.target.value)); }} /></label>
      {count > 1 && <label>结束时间（秒）<input type="number" min="0" step="0.001" max={current?.info.duration} value={end} onChange={(e) => { task.reset(); setEnd(Number(e.target.value)); }} /></label>}
      <label>输出最长边<select value={edge} onChange={(e) => { task.reset(); setEdge(Number(e.target.value)); }}><option value="0">原尺寸</option>{[3840, 1920, 1280, 640].map((value) => <option key={value} value={value}>{value}px（不放大）</option>)}</select></label>
      <label>图片格式<select value={format} onChange={(e) => { task.reset(); setFormat(e.target.value as typeof format); }}><option value="png">PNG · 无损</option><option value="jpeg">JPEG · 质量 92%</option></select></label>
      {current && !current.info.canDecode && <p className="utility-error" role="alert">浏览器无法解码此视频，请先转换为受支持的 MP4 / WebM。</p>}
      <button className="primary-button" type="button" disabled={!current || !current.info.canDecode || task.busy} onClick={() => current && void task.run((signal, report) => captureVideo(current.file, { start, end: count === 1 ? start : end, count, edge, format }, signal, report))}>{count > 1 ? "批量取帧" : "截取此时间画面"}</button><TaskFeedback task={task} />
      {task.result && <><LocalDownload blob={task.result.blob} name={task.result.name} title={task.result.count > 1 ? "下载截图 ZIP" : "下载截图"} /><p className="utility-muted">{task.result.count} 张 · {task.result.width} × {task.result.height}。批量 ZIP 附带请求时间与实际帧时间清单；截图对应所选时刻之前最近的可显示视频帧。</p></>}
    </section><section className="utility-panel utility-controls"><h2>视频与截图预览</h2>{videoUrl ? <video className="utility-video" src={videoUrl} controls playsInline preload="metadata" /> : <div className="utility-empty">导入后可预览视频</div>}
      {screenshot && <figure className="video-capture-preview"><img src={screenshot} alt="第一张取帧结果" /><figcaption>取帧结果{task.result && task.result.count > 1 ? "（第一张）" : ""}</figcaption></figure>}
      <p className="utility-muted">单张下载图片；多张按区间均匀抽取，保持画面比例，并打包 ZIP。所有处理均在本机完成。</p>
    </section></div>
  </UtilityShell>;
}
