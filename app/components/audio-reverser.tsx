"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiDownload, FiMusic, FiRefreshCw, FiUploadCloud, FiX } from "react-icons/fi";
import {
  createReversedName,
  encodeReversedWave,
  formatMediaDuration,
  formatMediaSize,
  validateAudioReverseFile,
} from "../lib/media-reversal";
import { FileDropZone } from "./file-drop-zone";

type AudioSource = {
  file: File;
  url: string;
  duration: number;
  sampleRate: number;
  channels: Float32Array[];
};

export default function AudioReverser() {
  const [source, setSource] = useState<AudioSource | null>(null);
  const [result, setResult] = useState<{ url: string; size: number; name: string } | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "reversing">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const urls = useRef({ source: "", result: "" });
  const job = useRef<AbortController | null>(null);
  const busy = phase !== "idle";

  useEffect(() => () => {
    job.current?.abort();
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

  async function selectAudio(file: File) {
    if (busy) return;
    const validationError = validateAudioReverseFile(file);
    if (validationError) {
      setError(`${validationError}。`);
      return;
    }

    clearResult();
    if (urls.current.source) URL.revokeObjectURL(urls.current.source);
    urls.current.source = "";
    setSource(null);
    setError("");
    setPhase("reading");
    const controller = new AbortController();
    job.current = controller;

    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      if (controller.signal.aborted) return;
      const channels = Array.from(
        { length: Math.min(2, decoded.numberOfChannels) },
        (_, index) => decoded.getChannelData(index).slice(),
      );
      const url = URL.createObjectURL(file);
      urls.current.source = url;
      setSource({
        file,
        url,
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        channels,
      });
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? `${cause.message}。请更换音频或浏览器后重试。` : "无法读取这个音频文件。");
      }
    } finally {
      await context?.close().catch(() => undefined);
      if (job.current === controller) job.current = null;
      if (!controller.signal.aborted) setPhase("idle");
    }
  }

  async function reverseAudio() {
    if (!source || busy) return;
    clearResult();
    setError("");
    setPhase("reversing");
    setProgress(1);
    const controller = new AbortController();
    job.current = controller;

    try {
      const blob = await encodeReversedWave(
        source.channels,
        source.sampleRate,
        controller.signal,
        setProgress,
      );
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      urls.current.result = url;
      setResult({
        url,
        size: blob.size,
        name: createReversedName(source.file.name, "audio"),
      });
      setProgress(100);
      setMessage("倒放完成");
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? `${cause.message}。` : "音频倒放失败，请重试。");
      }
    } finally {
      if (job.current === controller) job.current = null;
      setPhase("idle");
    }
  }

  function cancel() {
    job.current?.abort();
    job.current = null;
    setPhase("idle");
    setProgress(0);
    setMessage("已取消音频倒放");
  }

  return (
    <main className="tool-shell reverse-tool-shell">
      <Link className="back-link" href="/"><span aria-hidden="true">←</span> 多功能工具箱</Link>
      <header className="tool-header">
        <h1>音频倒放工具</h1>
        <p className="video-tool-description">将音频从结尾到开头反向播放，并导出兼容性好的WAV文件。</p>
      </header>

      <section className="converter-card reverse-tool-card" aria-label="音频倒放" aria-busy={busy}>
        <FileDropZone
          className="video-file-picker"
          accept="audio/*,.flac,.ogg,.oga,.opus,.m4a,.aac,.webm"
          ariaLabel="选择或拖入音频"
          disabled={busy}
          onFile={selectAudio}
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{phase === "reading" ? "正在读取音频…" : source ? "重新选择音频" : "选择音频"}</strong>
          <span>点击选择或拖入音频，支持MP3、WAV、M4A、AAC、FLAC、OGG、WebM等格式</span>
        </FileDropZone>

        <div className="reverse-tool-grid">
          <section className="reverse-tool-panel" aria-label="原音频">
            <div className="reverse-tool-heading"><h2>原音频</h2><span>{source ? `${formatMediaSize(source.file.size)} · ${formatMediaDuration(source.duration)}` : "等待选择"}</span></div>
            {source ? (
              <><strong className="reverse-tool-filename" title={source.file.name}>{source.file.name}</strong><audio controls preload="metadata" src={source.url} /></>
            ) : (
              <div className="file-tool-empty"><FiMusic aria-hidden="true" /><strong>原音频预览</strong><span>选择音频后可在这里试听</span></div>
            )}
          </section>
          <section className="reverse-tool-panel" aria-label="倒放结果">
            <div className="reverse-tool-heading"><h2>倒放结果</h2><span>{result ? `${formatMediaSize(result.size)} · WAV` : "等待处理"}</span></div>
            {result ? (
              <><audio controls preload="metadata" src={result.url} /><a className="gif-download-button" href={result.url} download={result.name}><FiDownload aria-hidden="true" />下载倒放音频</a></>
            ) : (
              <div className="file-tool-empty"><FiRefreshCw aria-hidden="true" /><strong>倒放后的音频</strong><span>处理完成后可试听和下载</span></div>
            )}
          </section>
        </div>

        <button className="convert-button" type="button" disabled={!source || busy} onClick={reverseAudio}>
          <FiRefreshCw aria-hidden="true" />{phase === "reversing" ? `正在倒放 ${progress}%` : "开始音频倒放"}
        </button>
        {busy ? <button className="reverse-tool-cancel" type="button" onClick={cancel}><FiX aria-hidden="true" />取消处理</button> : null}
        {phase === "reversing" ? <progress className="reverse-tool-progress" max="100" value={progress}>{progress}%</progress> : null}
        {error ? <p className="reverse-tool-error" role="alert">{error}</p> : null}
        {message ? <p className="reverse-tool-status" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
