"use client";
import { useRef, useState } from "react";
import { defaultVideoTrimOptions, type VideoTrimOptions } from "../lib/practical-tool-options";
import type { VideoTrimInfo, trimVideo } from "../lib/video-trimming";
import { LocalUpload, LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";
export default function VideoTrimmer() {
  const [options, setOptions] = useState(defaultVideoTrimOptions), video = useRef<HTMLVideoElement>(null);
  const source = useLocalTask<{ file: File; info: VideoTrimInfo }>(), output = useLocalTask<Awaited<ReturnType<typeof trimVideo>>>();
  const current = source.result, originalUrl = useBlobUrl(current?.file), resultUrl = useBlobUrl(output.result?.blob);
  function change(next: Partial<VideoTrimOptions>) { output.reset(); setOptions({ ...options, ...next }); }
  return <UtilityShell className="additional-utilities" title="视频裁剪" description="截取视频中的一段，预览起止位置，保留或移除声音并导出 MP4 / WebM。">
    <LocalUpload accept="video/*,.mkv,.ts,.mts,.m2ts,.avi" title="选择视频文件" hint="本地处理 · 最多 2 GB · 编解码支持取决于浏览器" onFiles={async (files) => {
      output.reset(); await source.run(async (signal) => { if (files.length !== 1) throw new Error("请选择一个视频文件。"); const { inspectTrimVideo } = await import("../lib/video-trimming"); const info = await inspectTrimVideo(files[0], signal); signal.throwIfAborted(); setOptions({ ...defaultVideoTrimOptions, end: info.duration }); return { file: files[0], info }; });
    }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>裁剪区间</h2>{current && <p className="utility-muted">{current.file.name} · {current.info.duration.toFixed(3)} 秒 · {current.info.width} × {current.info.height}</p>}
      <label>开始时间（秒）<input type="number" min="0" max={current?.info.duration} step="0.001" value={options.start} onChange={(e) => change({ start: Number(e.target.value) })} /></label>
      <label>结束时间（秒）<input type="number" min="0" max={current?.info.duration} step="0.001" value={options.end} onChange={(e) => change({ end: Number(e.target.value) })} /></label>
      <div className="utility-actions"><button type="button" disabled={!current || Math.abs(current.info.start) > 0.001} onClick={() => video.current && change({ start: Math.max(0, video.current.currentTime) })}>当前画面设为开始</button><button type="button" disabled={!current || Math.abs(current.info.start) > 0.001} onClick={() => video.current && change({ end: Math.min(current!.info.duration, video.current.currentTime) })}>当前画面设为结束</button></div>
      {current && Math.abs(current.info.start) > 0.001 && <p className="utility-muted">此文件媒体起点不为 0；浏览器播放器的时间轴可能不同，已停用画面标记。请按首个视频帧为 0 手动输入区间。</p>}
      <label>输出格式<select value={options.format} onChange={(e) => change({ format: e.target.value as VideoTrimOptions["format"] })}><option value="mp4">MP4 · H.264 / AAC</option><option value="webm">WebM · VP9 / VP8 / Opus</option></select></label>
      <label>输出分辨率<select value={options.resolution} onChange={(e) => change({ resolution: e.target.value as VideoTrimOptions["resolution"] })}><option value="original">原始尺寸</option><option value="2160">最多 4K</option><option value="1080">最多 1080p</option><option value="720">最多 720p</option><option value="480">最多 480p</option></select></label>
      <label className="utility-range-control"><span>画质<output>{options.quality}</output></span><input type="range" min="20" max="100" value={options.quality} onChange={(e) => change({ quality: Number(e.target.value) })} /></label>
      <label className="utility-checkbox"><input type="checkbox" checked={options.keepAudio} onChange={(e) => change({ keepAudio: e.target.checked })} />保留声音{current && !current.info.hasAudio && "（原视频无音轨）"}</label>
      <button type="button" className="primary-button" disabled={!current || !current.info.canDecode || output.busy} onClick={() => { video.current?.pause(); if (current) void output.run(async (signal, report) => (await import("../lib/video-trimming")).trimVideo(current.file, options, signal, report)); }}>裁剪并导出</button><TaskFeedback task={output} />
      {output.result && <LocalDownload blob={output.result.blob} name={`video-clip.${output.result.extension}`} title="下载裁剪片段" />}
      <p className="utility-muted">重新编码以支持任意起止位置，不承诺无损或毫秒级精确；边界受视频帧率与音频采样影响。保留主视频和可选主音轨，不保留字幕、其他音轨及描述元数据；编码失败不会自动移除声音。</p>
    </section><section className="utility-panel"><h2>原视频预览</h2>{originalUrl ? <video ref={video} className="video-trim-preview" src={originalUrl} controls playsInline preload="metadata" /> : <p className="utility-muted">选择视频后，在播放器里定位需要的片段。</p>}
      {current && !current.info.canDecode && <p className="utility-error">浏览器无法解码此视频，暂不能裁剪。</p>}
      {resultUrl && <><h2>裁剪结果 · 目标 {output.result!.duration.toFixed(3)} 秒</h2><video className="video-trim-preview" src={resultUrl} controls playsInline preload="metadata" /></>}
    </section></div>
  </UtilityShell>;
}
