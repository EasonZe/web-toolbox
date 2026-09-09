"use client";

import { useEffect, useRef, useState } from "react";
import { FiDownload, FiMusic, FiSliders, FiUploadCloud, FiX } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import { UtilityShell } from "./utility-shell";
import { createTransformedAudioName, encodeAudioBufferToWave, MAX_AUDIO_TRANSFORM_SECONDS, validateAudioTransformFile } from "../lib/audio-transform";
import { formatMediaDuration, formatMediaSize } from "../lib/media-reversal";

type Source = { file: File; url: string; buffer: AudioBuffer };
type Result = { url: string; name: string; size: number; duration: number };

export default function AudioSpeedPitch() {
  const [source, setSource] = useState<Source | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [speed, setSpeed] = useState(1);
  const [semitones, setSemitones] = useState(0);
  const [phase, setPhase] = useState<"idle" | "reading" | "processing">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const urls = useRef({ source: "", result: "" });
  const job = useRef(0);
  const busy = phase !== "idle";

  useEffect(() => () => {
    job.current += 1;
    if (urls.current.source) URL.revokeObjectURL(urls.current.source);
    if (urls.current.result) URL.revokeObjectURL(urls.current.result);
  }, []);

  function clearResult() {
    if (urls.current.result) URL.revokeObjectURL(urls.current.result);
    urls.current.result = "";
    setResult(null);
    setProgress(0);
    setMessage("");
  }

  function changeSettings(nextSpeed = speed, nextSemitones = semitones) {
    setSpeed(nextSpeed);
    setSemitones(nextSemitones);
    clearResult();
  }

  async function selectAudio(file: File) {
    const validation = validateAudioTransformFile(file);
    if (validation) return setError(`${validation}。`);
    const current = ++job.current;
    setPhase("reading"); setError(""); clearResult();
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      if (current !== job.current) return;
      if (buffer.duration > MAX_AUDIO_TRANSFORM_SECONDS) throw new Error("音频时长不能超过30分钟");
      if (urls.current.source) URL.revokeObjectURL(urls.current.source);
      const url = URL.createObjectURL(file);
      urls.current.source = url;
      setSource({ file, url, buffer });
      setMessage("音频已读取，可分别调整速度和音高。");
    } catch (cause) {
      if (current === job.current) setError(cause instanceof Error ? `${cause.message}。` : "无法读取这个音频文件。");
    } finally {
      await context?.close().catch(() => undefined);
      if (current === job.current) setPhase("idle");
    }
  }

  async function transform() {
    if (!source || busy) return;
    const current = ++job.current;
    const controller = new AbortController();
    clearResult(); setError(""); setPhase("processing"); setProgress(8); setMessage("正在进行变速与变调处理…");
    try {
      // SoundTouch's browser bundle extends AudioWorkletNode at module load time,
      // so keep it out of the server-rendering path and load it after a user action.
      const { processOffline } = await import("@soundtouchjs/audio-worklet");
      const processed = await processOffline({
        input: source.buffer,
        processorUrl: "/soundtouch/soundtouch-processor.js",
        playbackRate: speed,
        pitchSemitones: semitones,
      });
      if (current !== job.current) return;
      setProgress(72);
      const blob = await encodeAudioBufferToWave(processed, controller.signal, setProgress);
      if (current !== job.current) return;
      const url = URL.createObjectURL(blob);
      urls.current.result = url;
      setResult({ url, size: blob.size, duration: processed.duration, name: createTransformedAudioName(source.file.name, speed, semitones) });
      setProgress(100); setMessage("处理完成，可试听或下载WAV。");
    } catch (cause) {
      if (current === job.current) setError(cause instanceof Error ? `${cause.message}。请尝试较短的音频或更新浏览器。` : "音频处理失败。");
    } finally {
      if (current === job.current) setPhase("idle");
    }
  }

  function cancel() {
    job.current += 1;
    setPhase("idle"); setProgress(0); setMessage("已取消处理，迟到结果不会覆盖当前页面。");
  }

  return <UtilityShell title="音频变速与变调" description="独立调整播放速度与音高，使用 SoundTouch 高质量处理并导出 WAV。">
    <FileDropZone className="video-file-picker" accept="audio/*,.flac,.ogg,.oga,.opus,.m4a,.aac,.webm" disabled={busy} onFile={selectAudio} ariaLabel="选择或拖入音频">
      <FiUploadCloud aria-hidden="true" /><strong>{phase === "reading" ? "正在读取音频…" : source ? "重新选择音频" : "选择音频"}</strong><span>支持 MP3、WAV、M4A、AAC、FLAC、OGG、WebM，最大150 MB、30分钟</span>
    </FileDropZone>
    <div className="utility-columns audio-transform-columns">
      <section className="utility-panel utility-controls" aria-label="原音频">
        <div className="utility-heading"><h2>原音频</h2><span className="utility-muted">{source ? `${formatMediaSize(source.file.size)} · ${formatMediaDuration(source.buffer.duration)}` : "等待选择"}</span></div>
        {source ? <><strong className="reverse-tool-filename">{source.file.name}</strong><audio controls preload="metadata" src={source.url} /></> : <div className="utility-empty"><FiMusic aria-hidden="true" /><strong>原音频预览</strong><span>选择文件后可试听原始声音</span></div>}
      </section>
      <section className="utility-panel utility-controls" aria-label="变速变调设置">
        <h2>处理设置</h2>
        <label className="utility-range-control"><span>播放速度<output>{speed.toFixed(2)}×</output></span><input type="range" min="0.5" max="2" step="0.05" value={speed} disabled={busy} onChange={(event) => changeSettings(+event.target.value, semitones)} /></label>
        <div className="audio-transform-presets">{[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => <button type="button" aria-pressed={speed === value} disabled={busy} onClick={() => changeSettings(value, semitones)} key={value}>{value}×</button>)}</div>
        <label className="utility-range-control"><span>音高<output>{semitones > 0 ? "+" : ""}{semitones} 半音</output></span><input type="range" min="-12" max="12" step="1" value={semitones} disabled={busy} onChange={(event) => changeSettings(speed, +event.target.value)} /></label>
        <div className="audio-transform-presets">{[-12, -5, 0, 5, 12].map((value) => <button type="button" aria-pressed={semitones === value} disabled={busy} onClick={() => changeSettings(speed, value)} key={value}>{value > 0 ? "+" : ""}{value}</button>)}</div>
        <p className="utility-muted">变速不会连带改变音高；变调不会改变目标时长。预计输出 {source ? formatMediaDuration(source.buffer.duration / speed) : "0:00"}。</p>
      </section>
    </div>
    <section className="utility-panel utility-controls audio-transform-result" aria-label="处理结果">
      <div className="utility-heading"><h2>处理结果</h2><span className="utility-muted">{result ? `${formatMediaSize(result.size)} · ${formatMediaDuration(result.duration)}` : "等待处理"}</span></div>
      {result ? <><audio controls preload="metadata" src={result.url} /><a className="primary-button" href={result.url} download={result.name}><FiDownload aria-hidden="true" />下载变速变调音频</a></> : <div className="utility-empty compact"><FiSliders aria-hidden="true" /><strong>变速变调后的音频</strong><span>处理完成后可试听和下载</span></div>}
    </section>
    <button className="primary-button" type="button" disabled={!source || busy} onClick={() => void transform()}>{phase === "processing" ? `正在处理 ${progress}%` : "开始处理音频"}</button>
    {phase === "processing" ? <><progress className="reverse-tool-progress" max="100" value={progress}>{progress}%</progress><button type="button" onClick={cancel}><FiX aria-hidden="true" />取消处理</button></> : null}
    {error ? <p className="utility-error" role="alert">{error}</p> : null}{message ? <p className="utility-muted" role="status">{message}</p> : null}
  </UtilityShell>;
}
