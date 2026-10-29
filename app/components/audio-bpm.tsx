"use client";
import { useState } from "react";
import type { AudioInfo } from "../lib/audio-compression";
import type { BpmOptions, BpmResult } from "../lib/audio-bpm-options";
import { validateBpmOptions } from "../lib/audio-bpm-options";
import { UtilityShell } from "./utility-shell";
import { LocalUpload, TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityResult } from "./text-utility-parts";

export default function AudioBpm() {
  const [uploadKey, setUploadKey] = useState(0);
  const [start, setStart] = useState("0"), [end, setEnd] = useState<string | null>(null), [min, setMin] = useState("90"), [max, setMax] = useState("180"), [channel, setChannel] = useState<BpmOptions["channel"]>("first");
  const metadata = useLocalTask<{ file: File; info: AudioInfo }>(), task = useLocalTask<BpmResult>();
  const file = metadata.result?.file, effectiveEnd = end ?? String(Math.min(60, metadata.result?.info.duration ?? 60));
  function reset() { task.reset(); }
  return <UtilityShell className="additional-utilities" title="音频 BPM 分析" description="读取音频的指定区间，估算节拍速度；不播放、不上传音频。">
    <LocalUpload key={uploadKey} accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.webm" title="选择音频 / 拖入文件" hint="复用本地媒体解码器，只读取所选区间；支持格式取决于浏览器。" onFiles={(files) => {
      reset(); metadata.reset(); setStart("0"); setEnd(null);
      if (files[0]) void metadata.run(async (signal) => ({ file: files[0], info: await (await import("../lib/audio-compression")).readAudioInfo(files[0], signal) }));
    }} />
    <TaskFeedback task={metadata} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>分析设置</h2>
      {metadata.result && <p className="utility-muted">{metadata.result.file.name} · {metadata.result.info.duration.toFixed(2)} 秒 · {metadata.result.info.channels} 声道 · {metadata.result.info.sampleRate} Hz</p>}
      <div className="bpm-input-grid">{([["开始时间（秒）", start, setStart], ["结束时间（秒）", effectiveEnd, setEnd], ["最低 BPM", min, setMin], ["最高 BPM", max, setMax]] as const).map(([label, value, update]) => <label key={label}>{label}<input type="number" step="any" value={value} onChange={(e) => { reset(); update(e.target.value); }} /></label>)}</div>
      <label>分析声道<select value={channel} onChange={(e) => { reset(); setChannel(e.target.value as BpmOptions["channel"]); }}><option value="first">首声道（左）</option><option value="second">第二声道（右）</option><option value="mix">前两个声道平均混合</option></select></label>
      <div className="utility-actions"><button type="button" className="primary-button" disabled={!file || metadata.busy || task.busy} onClick={() => { if (!file) return; void task.run(async (signal, report) => {
        const options = { start: Number(start), end: Number(effectiveEnd), min: Number(min), max: Number(max), channel }; validateBpmOptions(options);
        const { samples, sampleRate } = await (await import("../lib/audio-bpm-source")).readBpmSamples(file, options, signal, report); signal.throwIfAborted(); report(80, "正在分析节拍…");
        const value = await (await import("../lib/audio-bpm-worker-client")).estimateBpm(samples, sampleRate, options, signal); return { ...value, ...options, sampleRate };
      }); }}>开始分析 BPM</button><button type="button" onClick={() => { reset(); metadata.reset(); setStart("0"); setEnd(null); setUploadKey((value) => value + 1); }}>清空</button></div>
      <TaskFeedback task={task} />
      <p className="utility-muted">建议选择节奏稳定的 30–90 秒，至少 5 秒。BPM 搜索范围 30–300，按采样量与设备检查工作预算；不会偷偷缩短所选区间。</p>
      <p className="utility-muted">11.025 / 22.05 kHz 等采样率会在分析线程内做微量采样对齐，以适配节拍引擎；不更改源文件或所选时间范围。</p>
      <p className="utility-muted">低通与包络预处理后估算节奏，不是节拍标注或变速检测。弱鼓点、变速音乐、语音或环境噪声可能误判；混合反相声道时可改用左 / 右声道。倍速 / 半速是常见歧义，不代表置信度。</p>
    </section><section className="utility-panel"><h2>估算结果</h2>{task.result ? <>
      <strong className="bpm-result">{task.result.tempo.toFixed(2)} <small>BPM（估算）</small></strong>
      <p className="utility-muted">分析区间 {task.result.start}–{task.result.end} 秒 · 节拍相位约 {task.result.phase.toFixed(3)} 秒（相对区间起点，并非歌曲首拍）</p>
      <p className="utility-muted">可人工试听核对的半速 / 倍速：{task.result.alternatives.map((value) => value.toFixed(2)).join(" / ") || "无"} BPM。不会自动改动音频。</p>
      <TextUtilityResult key={JSON.stringify(task.result)} text={JSON.stringify(task.result, null, 2)} name="audio-bpm.json" mime="application/json" />
    </> : <p className="utility-muted">选择音频后，设置区间开始分析。结果仅供节奏参考，未提供准确率或置信度保证。</p>}</section></div>
  </UtilityShell>;
}
