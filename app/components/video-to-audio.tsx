"use client";
import { toolLimits } from "../lib/resource-limits";
import { extractAudioWave } from "../lib/audio-extraction";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  FiDownload,
  FiMusic,
  FiUploadCloud,
} from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";

type ChannelMode = "stereo" | "mono";

type AudioResult = {
  url: string;
  size: number;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
};

const maxVideoFileSize = toolLimits.media.fileBytes;

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;

  if (hours) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainder
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodeWav(audioBuffer: AudioBuffer, channelMode: ChannelMode) {
  const sourceChannels = audioBuffer.numberOfChannels;
  const outputChannels = channelMode === "mono" ? 1 : sourceChannels > 1 ? 2 : 1;
  const frameCount = audioBuffer.length;
  const bytesPerSample = 2;
  const dataSize = frameCount * outputChannels * bytesPerSample;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);
  const sourceData = Array.from({ length: sourceChannels }, (_, index) =>
    audioBuffer.getChannelData(index),
  );

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, outputChannels, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(
    28,
    audioBuffer.sampleRate * outputChannels * bytesPerSample,
    true,
  );
  view.setUint16(32, outputChannels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    if (outputChannels === 1) {
      let mixedSample = 0;
      for (let channel = 0; channel < sourceChannels; channel += 1) {
        mixedSample += sourceData[channel][frame] ?? 0;
      }
      mixedSample /= sourceChannels;
      const sample = Math.max(-1, Math.min(1, mixedSample));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += bytesPerSample;
      continue;
    }

    for (let channel = 0; channel < outputChannels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, sourceData[channel][frame] ?? 0));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += bytesPerSample;
    }
  }

  return {
    blob: new Blob([wavBuffer], { type: "audio/wav" }),
    channels: outputChannels,
  };
}

export default function VideoToAudio() {
  const sourceUrlRef = useRef("");
  const resultUrlRef = useRef("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const extractionJob = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [sampleRate, setSampleRate] = useState(44100);
  const [channelMode, setChannelMode] = useState<ChannelMode>("stereo");
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AudioResult | null>(null);

  useEffect(() => {
    return () => {
      extractionJob.current?.abort();
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult(null);
    setProgress(0);
    setStatus("");
  }

  function handleFileChange(selectedFile: File) {
    const looksLikeVideo =
      selectedFile.type.startsWith("video/") ||
      /\.(mp4|m4v|mov|webm|ogv|ogg|mkv)$/i.test(selectedFile.name);
    if (!looksLikeVideo) {
      setMessage("请选择常见的视频文件。");
      return;
    }
    if (selectedFile.size > maxVideoFileSize) {
      setMessage("视频文件不能超过2 GB。");
      return;
    }

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    clearResult();

    const nextSourceUrl = URL.createObjectURL(selectedFile);
    sourceUrlRef.current = nextSourceUrl;
    setFile(selectedFile);
    setSourceUrl(nextSourceUrl);
    setVideoDuration(0);
    setMessage("");
  }

  async function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video || !file) return;
    if (Number.isFinite(video.duration) && video.duration > 0) { setVideoDuration(video.duration); setMessage(""); return; }
    const current = sourceUrlRef.current;
    let input: { dispose: () => void } | undefined;
    try {
      setMessage("正在读取媒体时间轴…");
      const media = await import("mediabunny");
      const source = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS }); input = source;
      const duration = await source.computeDuration();
      if (sourceUrlRef.current !== current) return;
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("无法读取完整的媒体时间轴。");
      setVideoDuration(duration); setMessage("");
    } catch (cause) { if (sourceUrlRef.current === current) setMessage(cause instanceof Error ? cause.message : "无法读取这个视频的信息。"); }
    finally { input?.dispose(); }
  }

  async function handleExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !videoDuration) {
      setMessage("请等待视频信息读取完成后再提取。");
      return;
    }

    videoRef.current?.pause();
    clearResult();
    setExtracting(true);
    setMessage("");
    try {
      setStatus("正在逐段提取音轨并生成 WAV…");
      setProgress(1);
      const controller = new AbortController(); extractionJob.current = controller;
      const encoded = await extractAudioWave(file, sampleRate, channelMode === "mono", controller.signal, setProgress);
      if (controller.signal.aborted) return;
      const resultUrl = URL.createObjectURL(encoded.blob);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "audio";
      const name = `${baseName}.wav`;

      resultUrlRef.current = resultUrl;
      setResult({
        url: resultUrl,
        size: encoded.blob.size,
        name,
        duration: encoded.duration,
        sampleRate: encoded.sampleRate,
        channels: encoded.channels,
      });
      setStatus("提取完成");
      setProgress(100);
    } catch (error) {
      if (extractionJob.current?.signal.aborted) { setStatus("已取消提取。"); setProgress(0); return; }
      const fallbackMessage =
        "提取失败，当前浏览器可能不支持这个视频的音频编码。";
      setMessage(
        error instanceof DOMException
          ? fallbackMessage
          : error instanceof Error
            ? `${error.message}。`
            : fallbackMessage,
      );
      setStatus("");
      setProgress(0);
    } finally {
      extractionJob.current = null;
      setExtracting(false);
    }
  }

  return (
    <main className="tool-shell audio-extractor-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> 多功能工具箱
      </Link>

      <header className="tool-header audio-extractor-header">
        <h1>视频提取音频工具</h1>
        <p>提取视频中的音频并导出WAV。</p>
      </header>

      <section
        className="converter-card audio-extractor-card"
        aria-label="视频提取音频"
        aria-busy={extracting}
      >
        <FileDropZone
          className="video-file-picker"
          accept="video/*"
          disabled={extracting}
          onFile={handleFileChange}
          ariaLabel="选择或拖入视频"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{file ? "重新选择视频" : "选择视频"}</strong>
          <span>点击选择或拖入视频，支持MP4、WebM、MOV等格式，最大2 GB</span>
        </FileDropZone>

        <div className="video-source-preview">
          {sourceUrl ? (
            <>
              <video
                ref={videoRef}
                src={sourceUrl}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={handleLoadedMetadata}
              />
              {file ? (
                <div className="video-file-meta">
                  <strong>{file.name}</strong>
                  <span>
                    {formatFileSize(file.size)}
                    {videoDuration
                      ? ` · ${formatDuration(videoDuration)}`
                      : " · 正在读取"}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="file-tool-empty video-preview-empty">
              <FiMusic aria-hidden="true" />
              <strong>视频预览</strong>
              <span>选择视频后在这里预览原视频</span>
            </div>
          )}
        </div>

        <form className="audio-extractor-form" onSubmit={handleExtract}>
              <div className="audio-extractor-options">
                <label>
                  <span>采样率</span>
                  <select
                    value={sampleRate}
                    disabled={extracting}
                    onChange={(event) =>
                      setSampleRate(Number(event.target.value))
                    }
                  >
                    <option value="44100">44.1 kHz</option>
                    <option value="48000">48 kHz</option>
                  </select>
                </label>
                <label>
                  <span>声道</span>
                  <select
                    value={channelMode}
                    disabled={extracting}
                    onChange={(event) =>
                      setChannelMode(event.target.value as ChannelMode)
                    }
                  >
                    <option value="stereo">立体声</option>
                    <option value="mono">单声道</option>
                  </select>
                </label>
              </div>

              <p className="audio-extractor-note">
                输出为未压缩WAV格式；视频越长，生成的音频文件越大。
              </p>

              <button
                className="convert-button audio-extractor-convert"
                type="submit"
                disabled={extracting || !videoDuration}
              >
                {extracting ? "正在提取…" : "提取音频"}
              </button>
              {extracting && <button type="button" className="back-link" onClick={() => { extractionJob.current?.abort(); setStatus("已取消提取。"); }}>取消提取</button>}
        </form>

        {status ? (
          <div
                className="video-gif-progress"
                role="status"
                aria-live="polite"
              >
                <div>
                  <span>{status}</span>
                  <strong>{progress}%</strong>
                </div>
                <progress max="100" value={progress}>
                  {progress}%
                </progress>
          </div>
        ) : null}

        {message ? (
          <p className="message" role="alert">
            {message}
          </p>
        ) : null}

        <section
          className="audio-extractor-result"
          aria-labelledby="audio-result-title"
        >
            <div className="video-gif-result-header">
              <div>
                <h2 id="audio-result-title">音频预览</h2>
                {result ? (
                  <span>
                    {formatFileSize(result.size)} ·{" "}
                    {formatDuration(result.duration)} ·{" "}
                    {(result.sampleRate / 1000).toFixed(1)} kHz ·{" "}
                    {result.channels === 1 ? "单声道" : "立体声"}
                  </span>
                ) : <span>等待提取</span>}
              </div>
              {result ? (
                <a
                  className="gif-download-button"
                  href={result.url}
                  download={result.name}
                >
                  <FiDownload aria-hidden="true" />
                  下载WAV
                </a>
              ) : null}
            </div>
            {result ? (
              <div className="audio-player-panel">
                <FiMusic aria-hidden="true" />
                <audio src={result.url} controls preload="metadata" />
              </div>
            ) : (
              <div className="file-tool-empty result-preview-empty">
                <FiMusic aria-hidden="true" />
                <strong>音频会显示在这里</strong>
                <span>选择视频并完成提取后即可试听</span>
              </div>
            )}
        </section>
      </section>
    </main>
  );
}
