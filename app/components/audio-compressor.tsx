"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiDownload, FiMusic, FiRefreshCw, FiUploadCloud } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import {
  audioBitrates, compressedAudioName, compressAudio, defaultAudioSettings,
  estimateAudioBytes, readAudioInfo, validateAudioFile,
} from "../lib/audio-compression";
import type { AudioFormat, AudioInfo, AudioSettings } from "../lib/audio-compression";

function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function durationLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function AudioCompressor() {
  const [source, setSource] = useState<{ file: File; info: AudioInfo; url: string } | null>(null);
  const [settings, setSettings] = useState<AudioSettings>({ ...defaultAudioSettings });
  const [result, setResult] = useState<{ size: number; url: string; name: string } | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "compressing">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const job = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urls = useRef({ source: "", result: "" });
  const busy = phase !== "idle";

  useEffect(() => () => {
    job.current?.abort();
    job.current = null;
    clearTimeout(timer.current);
    URL.revokeObjectURL(urls.current.source);
    URL.revokeObjectURL(urls.current.result);
  }, []);

  function clearResult() {
    URL.revokeObjectURL(urls.current.result);
    urls.current.result = "";
    setResult(null);
    setProgress(0);
  }

  function stop(timedOut = false) {
    job.current?.abort();
    job.current = null;
    clearTimeout(timer.current);
    setPhase("idle");
    setProgress(0);
    setMessage(timedOut ? "" : "已取消，可以调整参数后重试。");
    setError(timedOut ? "处理长时间没有进展，已停止。请换用MP3或较小的文件重试。" : "");
  }

  function armTimeout(milliseconds: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => stop(true), milliseconds);
  }

  function changeSettings(next: Partial<AudioSettings>) {
    if (job.current) return;
    setSettings((previous) => ({ ...previous, ...next }));
    clearResult();
    setMessage("");
    setError("");
  }

  async function selectFile(file: File) {
    if (job.current) return;
    clearResult();
    URL.revokeObjectURL(urls.current.source);
    urls.current.source = "";
    setSource(null);
    setError("");
    setMessage("");
    const controller = new AbortController();
    job.current = controller;
    setPhase("reading");
    armTimeout(30000);
    try {
      validateAudioFile(file);
      const info = await readAudioInfo(file, controller.signal);
      if (job.current !== controller) return;
      const url = URL.createObjectURL(file);
      urls.current.source = url;
      setSource({ file, info, url });
    } catch (cause) {
      if (job.current === controller) setError(cause instanceof Error ? cause.message : "音频读取失败，请检查文件是否损坏。");
    } finally {
      if (job.current === controller) {
        job.current = null;
        clearTimeout(timer.current);
        setPhase("idle");
      }
    }
  }

  async function startCompression() {
    if (!source || job.current) return;
    const controller = new AbortController();
    job.current = controller;
    clearResult();
    setError("");
    setMessage("");
    setPhase("compressing");
    armTimeout(120000);
    let lastProgress = -1;
    try {
      const blob = await compressAudio(source.file, settings, controller.signal, (value) => {
        if (job.current !== controller) return;
        setProgress(value);
        if (value > lastProgress) { lastProgress = value; armTimeout(120000); }
      });
      if (job.current !== controller) return;
      const url = URL.createObjectURL(blob);
      urls.current.result = url;
      setResult({ size: blob.size, url, name: compressedAudioName(source.file.name, settings.format) });
      setProgress(100);
      setMessage(blob.size < source.file.size ? "压缩完成" : "处理完成，但文件没有变小。可以降低码率后重试。");
    } catch (cause) {
      if (job.current === controller) setError(cause instanceof Error ? cause.message : "压缩失败，请换用MP3或其他文件重试。");
    } finally {
      if (job.current === controller) {
        job.current = null;
        clearTimeout(timer.current);
        setPhase("idle");
      }
    }
  }

  const estimate = source ? estimateAudioBytes(source.info.duration, settings.bitrate) : 0;
  const saved = source && result ? (1 - result.size / source.file.size) * 100 : 0;

  return (
    <main className="tool-shell audio-compressor-shell">
      <Link className="back-link" href="/">← Eason的工具箱</Link>
      <header className="tool-header audio-compressor-header">
        <h1>音频压缩工具</h1>
        <p>调节码率、采样率与声道，导出更小的MP3、M4A或OGG音频。</p>
      </header>
      <section className="converter-card audio-compressor-card" aria-label="音频压缩">
        <FileDropZone className="video-file-picker" accept="audio/*,.flac,.ogg,.oga,.opus,.m4a,.aac,.webm"
          ariaLabel="选择或拖入音频" disabled={busy} onFile={selectFile}>
          <FiUploadCloud aria-hidden="true" />
          <strong>{phase === "reading" ? "正在读取音频…" : source ? "重新选择音频" : "选择音频"}</strong>
          <span>点击选择或拖入文件 · MP3、WAV、M4A、AAC、FLAC、OGG、WebM · 最大500 MB</span>
        </FileDropZone>

        <div className="audio-compressor-workbench">
          <div className="audio-compressor-previews">
            <section className="audio-compressor-panel" aria-label="原音频">
              <h2>原音频</h2>
              {source ? <>
                <strong className="audio-compressor-filename" title={source.file.name}>{source.file.name}</strong>
                <p className="audio-compressor-meta">{sizeLabel(source.file.size)} · {durationLabel(source.info.duration)} · {source.info.sampleRate} Hz · {source.info.channels}声道</p>
                <audio controls preload="metadata" src={source.url} aria-label="原音频试听" />
              </> : <div className="file-tool-empty audio-compressor-empty"><FiMusic aria-hidden="true" /><strong>音频预览</strong><span>选择音频后可在这里试听</span></div>}
            </section>
            <section className="audio-compressor-panel" aria-label="压缩结果">
              <h2>压缩结果</h2>
              {source && result ? <>
                <div className="audio-compressor-sizes"><span>原大小<strong>{sizeLabel(source.file.size)}</strong></span><span>压缩后<strong>{sizeLabel(result.size)}</strong></span><span>{saved > 0 ? "减少" : "增加"}<strong>{Math.abs(saved).toFixed(1)}%</strong></span></div>
                <audio controls preload="metadata" src={result.url} aria-label="压缩后试听" />
                <a className="gif-download-button" href={result.url} download={result.name}><FiDownload aria-hidden="true" />下载音频</a>
              </> : <div className="file-tool-empty audio-compressor-empty"><FiMusic aria-hidden="true" /><strong>等待压缩</strong><span>完成后可对比大小、试听并下载</span></div>}
            </section>
          </div>
          <section className="audio-compressor-panel audio-compressor-settings" aria-label="压缩设置">
            <div className="audio-compressor-panel-title"><h2>压缩设置</h2><button type="button" disabled={busy} className="audio-compressor-reset" onClick={() => changeSettings(defaultAudioSettings)}><FiRefreshCw aria-hidden="true" />恢复默认</button></div>
            <fieldset disabled={busy}>
              <legend>输出格式</legend>
              <div className="audio-compressor-options">{(["mp3", "m4a", "ogg"] as AudioFormat[]).map((format) => <button key={format} type="button" aria-pressed={settings.format === format} onClick={() => changeSettings({ format })}>{format.toUpperCase()}</button>)}</div>
            </fieldset>
            <fieldset disabled={busy}>
              <legend>压缩方案</legend>
              <div className="audio-compressor-options">{[{ bitrate: 64, label: "更小体积" }, { bitrate: 128, label: "均衡" }, { bitrate: 192, label: "更好音质" }].map((preset) => <button key={preset.bitrate} type="button" aria-pressed={settings.bitrate === preset.bitrate} onClick={() => changeSettings({ bitrate: preset.bitrate })}>{preset.label}</button>)}</div>
            </fieldset>
            <label className="audio-compressor-field"><span>音频码率</span><select value={settings.bitrate} disabled={busy} onChange={(event) => changeSettings({ bitrate: Number(event.target.value) })}>{audioBitrates.map((rate) => <option key={rate} value={rate}>{rate} kbps</option>)}</select></label>
            <label className="audio-compressor-field"><span>采样率</span><select value={settings.format === "ogg" ? 48000 : settings.sampleRate} disabled={busy || settings.format === "ogg"} onChange={(event) => changeSettings({ sampleRate: Number(event.target.value) })}>{[32000, 44100, 48000].map((rate) => <option key={rate} value={rate}>{rate} Hz</option>)}</select></label>
            {settings.format === "ogg" && <p className="audio-compressor-meta">OGG使用Opus编码，采样率为48000 Hz。</p>}
            <label className="audio-compressor-field"><span>声道</span><select value={settings.channels} disabled={busy} onChange={(event) => changeSettings({ channels: event.target.value as AudioSettings["channels"] })}><option value="original">跟随原音频（最多双声道）</option><option value="mono">单声道</option><option value="stereo">双声道</option></select></label>
            <p className="audio-compressor-meta">码率越低，文件越小，音质也会降低。已压缩的音频不一定能继续缩小。</p>
            <div className="audio-compressor-estimate"><span>预计大小</span><strong>{estimate ? sizeLabel(estimate) : "—"}</strong><small>仅供参考，以实际结果为准</small></div>
            <button className="convert-button" type="button" disabled={!source || busy} onClick={startCompression}>{phase === "compressing" ? `正在压缩 ${progress}%` : "开始压缩"}</button>
            {busy && <button className="audio-compressor-cancel" type="button" onClick={() => stop()}>取消{phase === "reading" ? "读取" : "压缩"}</button>}
            {phase === "compressing" && <progress className="audio-compressor-progress" aria-label="音频压缩进度" max={100} value={progress} />}
          </section>
        </div>
        {error && <p className="audio-compressor-error" role="alert">{error}</p>}
        <p className="audio-compressor-status" role="status">{message}</p>
      </section>
    </main>
  );
}
