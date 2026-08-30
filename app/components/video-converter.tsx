"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiFilm, FiRefreshCw, FiUploadCloud, FiX } from "react-icons/fi";
import {
  createConvertedVideoName,
  createVideoConversionPlan,
  validateVideoConversionFile,
  videoOutputProfiles,
  type VideoFrameRate,
  type VideoOutputFormat,
  type VideoResolution,
} from "../lib/video-conversion";
import { FileDropZone } from "./file-drop-zone";

type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  hasAudio: boolean;
};

type VideoResult = {
  url: string;
  name: string;
  size: number;
  width: number;
  height: number;
  frameRate: number;
  format: VideoOutputFormat;
};

const codecNames: Record<string, string> = {
  avc: "H.264",
  hevc: "H.265",
  vp9: "VP9",
  vp8: "VP8",
  av1: "AV1",
  prores: "ProRes",
};

const formatOrder = Object.keys(videoOutputProfiles) as VideoOutputFormat[];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return hours
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`
    : `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function qualityLabel(quality: number) {
  if (quality < 45) return "体积优先";
  if (quality < 75) return "均衡";
  return "清晰优先";
}

function describeConversionError(reason?: string) {
  if (reason === "undecodable_source_codec") return "当前浏览器无法解码原视频编码";
  if (reason === "no_encodable_target_codec") return "当前浏览器无法编码所选输出格式";
  if (reason === "unknown_source_codec") return "无法识别原视频编码";
  return "当前视频轨道无法完成格式转换";
}

export default function VideoConverter() {
  const sourceUrlRef = useRef("");
  const resultUrlRef = useRef("");
  const conversionRef = useRef<{ cancel: () => Promise<void> } | null>(null);
  const cancelRequestedRef = useRef(false);
  const readJobRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [outputFormat, setOutputFormat] = useState<VideoOutputFormat>("mp4");
  const [resolution, setResolution] = useState<VideoResolution>("original");
  const [frameRate, setFrameRate] = useState<VideoFrameRate>("original");
  const [quality, setQuality] = useState(78);
  const [keepAudio, setKeepAudio] = useState(true);
  const [reading, setReading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<VideoResult | null>(null);
  const busy = reading || converting;

  useEffect(() => () => {
    readJobRef.current += 1;
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    void conversionRef.current?.cancel();
  }, []);

  const plan = useMemo(() => metadata
    ? createVideoConversionPlan({
        sourceWidth: metadata.width,
        sourceHeight: metadata.height,
        sourceFrameRate: metadata.frameRate,
        duration: metadata.duration,
        resolution,
        frameRate,
        quality,
        keepAudio,
        hasAudio: metadata.hasAudio,
      })
    : null, [frameRate, keepAudio, metadata, quality, resolution]);

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult(null);
    setProgress(0);
    setStatus("");
  }

  function changeSettings(action: () => void) {
    clearResult();
    setMessage("");
    action();
  }

  async function selectVideo(selectedFile: File) {
    const validationError = validateVideoConversionFile(selectedFile);
    if (validationError) {
      setMessage(`${validationError}。`);
      return;
    }

    const job = ++readJobRef.current;
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    clearResult();
    const nextUrl = URL.createObjectURL(selectedFile);
    sourceUrlRef.current = nextUrl;
    setFile(selectedFile);
    setSourceUrl(nextUrl);
    setMetadata(null);
    setReading(true);
    setMessage("");

    let input: { dispose: () => void } | null = null;
    try {
      const media = await import("mediabunny");
      const mediaInput = new media.Input({
        source: new media.BlobSource(selectedFile),
        formats: media.ALL_FORMATS,
      });
      input = mediaInput;
      const videoTrack = await mediaInput.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error("文件中没有可识别的视频轨道");
      if (!(await videoTrack.canDecode())) throw new Error("当前浏览器无法解码这个视频编码");
      const audioTrack = await mediaInput.getPrimaryAudioTrack();
      const [width, height, codec, durationFromMetadata, stats] = await Promise.all([
        videoTrack.getDisplayWidth(),
        videoTrack.getDisplayHeight(),
        videoTrack.getCodec(),
        videoTrack.getDurationFromMetadata(),
        videoTrack.computePacketStats(120),
      ]);
      const duration = durationFromMetadata && durationFromMetadata > 0
        ? durationFromMetadata
        : await videoTrack.computeDuration();
      if (!duration || !width || !height) throw new Error("无法读取这个视频的完整信息");
      if (job !== readJobRef.current) return;
      setMetadata({
        duration,
        width,
        height,
        frameRate: stats.averagePacketRate || 30,
        codec: codec ? (codecNames[codec] ?? codec.toUpperCase()) : "未知",
        hasAudio: Boolean(audioTrack),
      });
      setKeepAudio(Boolean(audioTrack));
    } catch (cause) {
      if (job === readJobRef.current) {
        setMetadata(null);
        setMessage(cause instanceof Error ? `${cause.message}。请更换文件或浏览器后重试。` : "无法读取这个视频文件。");
      }
    } finally {
      input?.dispose();
      if (job === readJobRef.current) setReading(false);
    }
  }

  async function convertVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !metadata || !plan || converting) {
      setMessage("请先选择一个可以读取的视频文件。");
      return;
    }

    clearResult();
    setConverting(true);
    setProgress(3);
    setStatus("正在准备视频转换…");
    setMessage("");
    cancelRequestedRef.current = false;
    let input: { dispose: () => void } | null = null;

    try {
      const media = await import("mediabunny");
      const profile = videoOutputProfiles[outputFormat];
      const videoCodec = await media.getFirstEncodableVideoCodec([...profile.videoCodecs], {
        width: plan.width,
        height: plan.height,
        bitrate: plan.videoBitrate,
      });
      if (!videoCodec) throw new Error(`当前浏览器无法编码${profile.label}所需的视频编码`);
      if (keepAudio && metadata.hasAudio && !(await media.canEncodeAudio(profile.audioCodec, {
        numberOfChannels: 2,
        sampleRate: 48_000,
        bitrate: plan.audioBitrate,
      }))) {
        throw new Error(`当前浏览器无法编码${profile.label}声音，请关闭保留声音后重试`);
      }

      const mediaInput = new media.Input({
        source: new media.BlobSource(file),
        formats: media.ALL_FORMATS,
      });
      input = mediaInput;
      const target = new media.BufferTarget();
      const format = outputFormat === "mp4"
        ? new media.Mp4OutputFormat({ fastStart: false })
        : outputFormat === "mov"
          ? new media.MovOutputFormat({ fastStart: false })
          : outputFormat === "mkv"
            ? new media.MkvOutputFormat()
            : new media.WebMOutputFormat();
      const output = new media.Output({ format, target });

      setStatus("正在分析视频轨道…");
      setProgress(6);
      const conversion = await media.Conversion.init({
        input: mediaInput,
        output,
        tracks: "primary",
        video: {
          codec: videoCodec,
          bitrate: plan.videoBitrate,
          width: plan.width,
          height: plan.height,
          fit: "fill",
          frameRate: plan.frameRate,
          keyFrameInterval: 3,
          hardwareAcceleration: "no-preference",
          forceTranscode: true,
        },
        audio: keepAudio && metadata.hasAudio
          ? {
              codec: profile.audioCodec,
              bitrate: plan.audioBitrate,
              numberOfChannels: 2,
              sampleRate: 48_000,
              forceTranscode: true,
            }
          : { discard: true },
        showWarnings: false,
      });
      conversionRef.current = conversion;
      if (!conversion.isValid) throw new Error(describeConversionError(conversion.discardedTracks[0]?.reason));
      conversion.onProgress = (nextProgress) => {
        setStatus(`正在转换为${profile.label}…`);
        setProgress(Math.min(99, Math.max(6, Math.round(nextProgress * 100))));
      };
      await conversion.execute();
      if (!target.buffer) throw new Error("没有生成转换后的视频");

      const blob = new Blob([target.buffer], { type: profile.mimeType });
      const resultUrl = URL.createObjectURL(blob);
      resultUrlRef.current = resultUrl;
      setResult({
        url: resultUrl,
        name: createConvertedVideoName(file.name, outputFormat),
        size: blob.size,
        width: plan.width,
        height: plan.height,
        frameRate: plan.frameRate,
        format: outputFormat,
      });
      setProgress(100);
      setStatus("转换完成");
    } catch (cause) {
      setProgress(0);
      setStatus("");
      setMessage(cancelRequestedRef.current
        ? "已取消视频转换。"
        : cause instanceof Error
          ? `${cause.message}。请更换格式或浏览器后重试。`
          : "视频格式转换失败，请更换格式或浏览器后重试。");
    } finally {
      conversionRef.current = null;
      input?.dispose();
      setConverting(false);
    }
  }

  async function cancelConversion() {
    if (!conversionRef.current || !converting) return;
    cancelRequestedRef.current = true;
    setStatus("正在取消转换…");
    await conversionRef.current.cancel();
  }

  const selectedProfile = videoOutputProfiles[outputFormat];

  return (
    <main className="tool-shell video-converter-shell">
      <Link className="back-link" href="/"><span aria-hidden="true">←</span> Eason的工具箱</Link>
      <header className="tool-header video-converter-header">
        <h1>视频格式转换工具</h1>
        <p>转换视频格式并调整画面大小、帧率与画质。</p>
      </header>

      <section className="converter-card video-converter-card" aria-label="视频格式转换" aria-busy={busy}>
        <FileDropZone
          className="video-file-picker"
          accept="video/*,.mkv,.mov,.m4v,.ogv,.avi,.mpeg,.mpg,.ts,.mts,.m2ts"
          disabled={busy}
          onFile={selectVideo}
          ariaLabel="选择或拖入视频"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{reading ? "正在读取视频…" : file ? "重新选择视频" : "选择视频"}</strong>
          <span>点击选择或拖入视频，支持MP4、WebM、MOV、MKV等格式，最大500 MB</span>
        </FileDropZone>

        <section className="video-converter-source" aria-labelledby="video-converter-source-title">
          <div className="video-converter-heading">
            <div>
              <h2 id="video-converter-source-title">原视频预览</h2>
              <span>{file ? `${file.name} · ${formatFileSize(file.size)}` : "等待选择视频"}</span>
            </div>
          </div>
          {sourceUrl ? (
            <>
              <video src={sourceUrl} controls playsInline preload="metadata" />
              <div className="video-converter-source-meta">
                <span>{metadata ? `${formatDuration(metadata.duration)} · ${metadata.width}×${metadata.height}` : "正在读取视频信息"}</span>
                <span>{metadata ? `${metadata.codec} · ${metadata.frameRate.toFixed(1)} FPS · ${metadata.hasAudio ? "含声音" : "无声音"}` : "—"}</span>
              </div>
            </>
          ) : (
            <div className="file-tool-empty video-converter-empty">
              <FiFilm aria-hidden="true" />
              <strong>视频预览</strong>
              <span>选择视频后可在这里预览原视频</span>
            </div>
          )}
        </section>

        <form className="video-converter-form" onSubmit={convertVideo}>
          <div className="video-converter-workbench">
            <section className="video-converter-panel" aria-labelledby="video-converter-format-title">
              <div className="video-converter-heading">
                <div>
                  <h2 id="video-converter-format-title">目标格式</h2>
                  <span>选择转换后下载的视频格式</span>
                </div>
              </div>
              <div className="video-converter-formats">
                {formatOrder.map((format) => {
                  const profile = videoOutputProfiles[format];
                  return (
                    <button
                      type="button"
                      key={format}
                      aria-pressed={outputFormat === format}
                      disabled={!metadata || busy}
                      onClick={() => changeSettings(() => setOutputFormat(format))}
                    >
                      <strong>{profile.label}</strong>
                      <span>{profile.detail}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="video-converter-panel video-converter-settings" aria-labelledby="video-converter-settings-title">
              <h2 id="video-converter-settings-title">转换设置</h2>
              <div className="video-converter-setting-grid">
                <label>
                  <span>输出分辨率</span>
                  <select value={resolution} disabled={!metadata || busy} onChange={(event) => changeSettings(() => setResolution(event.target.value as VideoResolution))}>
                    <option value="original">保持原始分辨率</option>
                    <option value="2160">最高2160P</option>
                    <option value="1080">最高1080P</option>
                    <option value="720">最高720P</option>
                    <option value="480">最高480P</option>
                  </select>
                </label>
                <label>
                  <span>输出帧率</span>
                  <select value={frameRate} disabled={!metadata || busy} onChange={(event) => changeSettings(() => setFrameRate(event.target.value as VideoFrameRate))}>
                    <option value="original">保持原始帧率</option>
                    <option value="60">最高60 FPS</option>
                    <option value="30">最高30 FPS</option>
                    <option value="24">最高24 FPS</option>
                  </select>
                </label>
              </div>

              <label className="video-converter-quality">
                <span>输出画质 <strong>{quality}% · {qualityLabel(quality)}</strong></span>
                <input type="range" min="20" max="100" step="1" value={quality} disabled={!metadata || busy} onChange={(event) => changeSettings(() => setQuality(Number(event.target.value)))} />
              </label>

              <label className="video-converter-audio">
                <input type="checkbox" checked={Boolean(keepAudio && metadata?.hasAudio)} disabled={!metadata?.hasAudio || busy} onChange={(event) => changeSettings(() => setKeepAudio(event.target.checked))} />
                <span>保留视频声音{metadata ? metadata.hasAudio ? "" : "（原视频无声音）" : "（选择后检测）"}</span>
              </label>

              <div className="video-converter-summary">
                <span><small>输出画面</small><strong>{plan ? `${plan.width}×${plan.height} · ${plan.frameRate.toFixed(0)} FPS` : "等待视频"}</strong></span>
                <span><small>视频码率</small><strong>{plan ? `${(plan.videoBitrate / 1_000_000).toFixed(1)} Mbps` : "—"}</strong></span>
                <span><small>预计体积</small><strong>{plan ? `约 ${formatFileSize(plan.estimatedSize)}` : "—"}</strong></span>
              </div>

              <button className="convert-button video-converter-submit" type="submit" disabled={!metadata || !plan || busy}>
                <FiRefreshCw aria-hidden="true" />{converting ? "正在转换…" : `转换为${selectedProfile.label}`}
              </button>
              {converting ? (
                <button className="video-converter-cancel" type="button" onClick={cancelConversion}><FiX aria-hidden="true" />取消转换</button>
              ) : null}
            </section>
          </div>
        </form>

        {status ? (
          <div className="video-gif-progress" role="status" aria-live="polite">
            <div><span>{status}</span><strong>{progress}%</strong></div>
            <progress max="100" value={progress}>{progress}%</progress>
          </div>
        ) : null}
        {message ? <p className="message" role="alert">{message}</p> : null}

        <section className="video-converter-result" aria-labelledby="video-converter-result-title">
          <div className="video-converter-heading">
            <div>
              <h2 id="video-converter-result-title">转换结果</h2>
              <span>{result ? `${videoOutputProfiles[result.format].label} · ${formatFileSize(result.size)} · ${result.width}×${result.height} · ${result.frameRate.toFixed(0)} FPS` : "等待转换"}</span>
            </div>
            {result ? <a className="gif-download-button" href={result.url} download={result.name}><FiDownload aria-hidden="true" />下载视频</a> : null}
          </div>
          {result ? (
            <>
              <video src={result.url} controls playsInline preload="metadata" />
              <p>如果当前浏览器无法预览MOV或MKV，可直接下载后使用播放器打开。</p>
            </>
          ) : (
            <div className="file-tool-empty video-converter-result-empty">
              <FiFilm aria-hidden="true" />
              <strong>转换后的视频会显示在这里</strong>
              <span>选择视频并完成格式转换后即可预览和下载</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
