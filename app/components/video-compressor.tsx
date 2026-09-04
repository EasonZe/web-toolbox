"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiFilm, FiUploadCloud } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";

type OutputFormat = "mp4" | "webm";
type ResolutionLimit = "original" | "1080" | "720" | "480";
type FrameRateLimit = "original" | "30" | "24";

type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  hasAudio: boolean;
};

type CompressionResult = {
  url: string;
  name: string;
  size: number;
  width: number;
  height: number;
  frameRate: number;
  format: OutputFormat;
};

const MAX_FILE_SIZE = 300 * 1024 * 1024;

const codecNames: Record<string, string> = {
  avc: "H.264",
  hevc: "H.265",
  vp9: "VP9",
  vp8: "VP8",
  av1: "AV1",
  prores: "ProRes",
};

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

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

function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function targetDimensions(
  width: number,
  height: number,
  limit: ResolutionLimit,
) {
  const maxEdgeByResolution = {
    original: Infinity,
    "1080": 1920,
    "720": 1280,
    "480": 854,
  } satisfies Record<ResolutionLimit, number>;
  const maxEdge = maxEdgeByResolution[limit];
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: even(width * scale),
    height: even(height * scale),
  };
}

function targetFrameRate(sourceFrameRate: number, limit: FrameRateLimit) {
  const source = Number.isFinite(sourceFrameRate) && sourceFrameRate > 0
    ? sourceFrameRate
    : 30;
  return limit === "original" ? source : Math.min(source, Number(limit));
}

function targetVideoBitrate(
  width: number,
  height: number,
  frameRate: number,
  quality: number,
) {
  const bitsPerPixel = 0.012 + (quality / 100) * 0.08;
  return Math.round(
    Math.min(8_000_000, Math.max(300_000, width * height * frameRate * bitsPerPixel)),
  );
}

function qualityLabel(quality: number) {
  if (quality < 45) return "体积优先";
  if (quality < 75) return "均衡";
  return "清晰优先";
}

function conversionError(reason?: string) {
  if (reason === "undecodable_source_codec") {
    return "当前浏览器无法解码这个视频编码，请换用Chrome或Edge重试";
  }
  if (reason === "no_encodable_target_codec") {
    return "当前浏览器无法编码所选格式，请切换MP4或WebM重试";
  }
  if (reason === "unknown_source_codec") {
    return "无法识别原视频编码，请更换视频文件";
  }
  return "当前视频轨道无法完成压缩，请更换格式或浏览器后重试";
}

export default function VideoCompressor() {
  const sourceUrlRef = useRef("");
  const resultUrlRef = useRef("");
  const conversionRef = useRef<{ cancel: () => Promise<void> } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp4");
  const [resolution, setResolution] = useState<ResolutionLimit>("1080");
  const [frameRate, setFrameRate] = useState<FrameRateLimit>("30");
  const [quality, setQuality] = useState(60);
  const [keepAudio, setKeepAudio] = useState(true);
  const [reading, setReading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CompressionResult | null>(null);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      void conversionRef.current?.cancel();
    };
  }, []);

  const compressionPlan = useMemo(() => {
    if (!metadata) return null;
    const dimensions = targetDimensions(
      metadata.width,
      metadata.height,
      resolution,
    );
    const nextFrameRate = targetFrameRate(metadata.frameRate, frameRate);
    const requestedVideoBitrate = targetVideoBitrate(
      dimensions.width,
      dimensions.height,
      nextFrameRate,
      quality,
    );
    const audioBitrate = keepAudio && metadata.hasAudio ? 128_000 : 0;
    const sourceBitrate = file
      ? (file.size * 8) / metadata.duration
      : requestedVideoBitrate;
    const videoBitrate = Math.min(
      requestedVideoBitrate,
      Math.max(200_000, sourceBitrate * 0.9 - audioBitrate),
    );
    const estimatedSize =
      ((videoBitrate + audioBitrate) * metadata.duration) / 8;
    return {
      ...dimensions,
      frameRate: nextFrameRate,
      videoBitrate,
      audioBitrate,
      estimatedSize,
    };
  }, [file, frameRate, keepAudio, metadata, quality, resolution]);

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult(null);
    setProgress(0);
    setStatus("");
  }

  async function handleFileChange(selectedFile: File) {
    const looksLikeVideo =
      selectedFile.type.startsWith("video/") ||
      /\.(mp4|m4v|mov|webm|ogv|ogg|mkv)$/i.test(selectedFile.name);
    if (!looksLikeVideo) {
      setMessage("请选择常见的视频文件。");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setMessage("视频文件不能超过300 MB。");
      return;
    }

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    clearResult();
    const nextSourceUrl = URL.createObjectURL(selectedFile);
    sourceUrlRef.current = nextSourceUrl;
    setFile(selectedFile);
    setSourceUrl(nextSourceUrl);
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

      const canDecode = await videoTrack.canDecode();
      if (!canDecode) throw new Error("当前浏览器无法解码这个视频编码");

      const audioTrack = await mediaInput.getPrimaryAudioTrack();
      const [width, height, codec, durationFromMetadata, stats] =
        await Promise.all([
          videoTrack.getDisplayWidth(),
          videoTrack.getDisplayHeight(),
          videoTrack.getCodec(),
          videoTrack.getDurationFromMetadata(),
          videoTrack.computePacketStats(120),
        ]);
      const duration =
        durationFromMetadata && durationFromMetadata > 0
          ? durationFromMetadata
          : await videoTrack.computeDuration();
      if (!duration || !width || !height) {
        throw new Error("无法读取这个视频的完整信息");
      }

      setMetadata({
        duration,
        width,
        height,
        frameRate: stats.averagePacketRate || 30,
        codec: codec ? (codecNames[codec] ?? codec.toUpperCase()) : "未知",
        hasAudio: Boolean(audioTrack),
      });
      setKeepAudio(Boolean(audioTrack));
    } catch (error) {
      setMetadata(null);
      setMessage(
        error instanceof Error
          ? `${error.message}。请更换文件或浏览器后重试。`
          : "无法读取这个视频文件。",
      );
    } finally {
      input?.dispose();
      setReading(false);
    }
  }

  async function handleCompress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !metadata || !compressionPlan) {
      setMessage("请先选择一个可以读取的视频文件。");
      return;
    }

    clearResult();
    setCompressing(true);
    setStatus("正在准备视频压缩…");
    setProgress(3);
    setMessage("");

    let input: { dispose: () => void } | null = null;
    try {
      const media = await import("mediabunny");
      const isMp4 = outputFormat === "mp4";
      const videoCodec = isMp4
        ? await media.getFirstEncodableVideoCodec(["avc"], {
            width: compressionPlan.width,
            height: compressionPlan.height,
            bitrate: compressionPlan.videoBitrate,
          })
        : await media.getFirstEncodableVideoCodec(["vp9", "vp8"], {
            width: compressionPlan.width,
            height: compressionPlan.height,
            bitrate: compressionPlan.videoBitrate,
          });
      if (!videoCodec) {
        throw new Error(
          isMp4
            ? "当前浏览器不支持H.264视频编码，请切换WebM或换用Chrome、Edge重试"
            : "当前浏览器不支持WebM视频编码，请切换MP4重试",
        );
      }

      const audioCodec = isMp4 ? ("aac" as const) : ("opus" as const);
      if (
        keepAudio &&
        metadata.hasAudio &&
        !(await media.canEncodeAudio(audioCodec, {
          numberOfChannels: 2,
          sampleRate: 48_000,
          bitrate: compressionPlan.audioBitrate,
        }))
      ) {
        throw new Error("当前浏览器无法编码输出音频，请关闭保留声音后重试");
      }

      const mediaInput = new media.Input({
        source: new media.BlobSource(file),
        formats: media.ALL_FORMATS,
      });
      input = mediaInput;
      const target = new media.BufferTarget();
      const output = new media.Output({
        format: isMp4
          ? new media.Mp4OutputFormat({ fastStart: false })
          : new media.WebMOutputFormat(),
        target,
      });

      setStatus("正在分析视频轨道…");
      setProgress(6);
      const conversion = await media.Conversion.init({
        input: mediaInput,
        output,
        tracks: "primary",
        video: {
          codec: videoCodec,
          bitrate: compressionPlan.videoBitrate,
          width: compressionPlan.width,
          height: compressionPlan.height,
          fit: "fill",
          frameRate: compressionPlan.frameRate,
          keyFrameInterval: 3,
          hardwareAcceleration: "no-preference",
          forceTranscode: true,
        },
        audio:
          keepAudio && metadata.hasAudio
            ? {
                codec: audioCodec,
                bitrate: compressionPlan.audioBitrate,
                numberOfChannels: 2,
                sampleRate: 48_000,
                forceTranscode: true,
              }
            : { discard: true },
        showWarnings: false,
      });
      conversionRef.current = conversion;

      if (!conversion.isValid) {
        throw new Error(conversionError(conversion.discardedTracks[0]?.reason));
      }

      conversion.onProgress = (nextProgress) => {
        setStatus("正在压缩视频…");
        setProgress(Math.min(99, Math.max(6, Math.round(nextProgress * 100))));
      };
      await conversion.execute();
      if (!target.buffer) throw new Error("没有生成压缩视频");

      const mimeType = isMp4 ? "video/mp4" : "video/webm";
      const blob = new Blob([target.buffer], { type: mimeType });
      const resultUrl = URL.createObjectURL(blob);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "compressed-video";
      const name = `${baseName}-compressed.${outputFormat}`;
      resultUrlRef.current = resultUrl;
      setResult({
        url: resultUrl,
        name,
        size: blob.size,
        width: compressionPlan.width,
        height: compressionPlan.height,
        frameRate: compressionPlan.frameRate,
        format: outputFormat,
      });
      setStatus("压缩完成");
      setProgress(100);
    } catch (error) {
      setStatus("");
      setProgress(0);
      setMessage(
        error instanceof Error
          ? `${error.message}。`
          : "视频压缩失败，请更换格式或浏览器后重试。",
      );
    } finally {
      conversionRef.current = null;
      input?.dispose();
      setCompressing(false);
    }
  }

  const savedBytes = result && file ? file.size - result.size : 0;
  const savedPercent =
    result && file && file.size > 0
      ? Math.round((savedBytes / file.size) * 100)
      : 0;

  return (
    <main className="tool-shell video-compressor-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> 多功能工具箱
      </Link>

      <header className="tool-header video-compressor-header">
        <h1>视频压缩工具</h1>
        <p>调节画质、分辨率和帧率压缩视频。</p>
      </header>

      <section
        className="converter-card video-compressor-card"
        aria-label="视频压缩"
        aria-busy={compressing || reading}
      >
        <FileDropZone
          className="video-file-picker"
          accept="video/*"
          disabled={compressing || reading}
          onFile={handleFileChange}
          ariaLabel="选择或拖入视频"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{file ? "重新选择视频" : "选择视频"}</strong>
          <span>点击选择或拖入视频，支持MP4、WebM、MOV等格式，最大300 MB</span>
        </FileDropZone>

        <div className="video-source-preview">
          {sourceUrl ? (
            <>
            <video src={sourceUrl} controls playsInline preload="metadata" />
            {file ? (
              <div className="video-file-meta">
                <strong>{file.name}</strong>
                <span>
                  {formatFileSize(file.size)}
                  {metadata
                    ? ` · ${formatDuration(metadata.duration)} · ${metadata.width}×${metadata.height}`
                    : reading
                      ? " · 正在读取"
                      : ""}
                </span>
              </div>
            ) : null}
            </>
          ) : (
            <div className="file-tool-empty video-preview-empty">
              <FiFilm aria-hidden="true" />
              <strong>视频预览</strong>
              <span>选择视频后在这里预览原视频</span>
            </div>
          )}
        </div>

        <form className="video-compressor-form" onSubmit={handleCompress}>
            <div className="video-compressor-settings">
              <label>
                <span>输出格式</span>
                <select
                  value={outputFormat}
                  disabled={compressing}
                  onChange={(event) =>
                    setOutputFormat(event.target.value as OutputFormat)
                  }
                >
                  <option value="mp4">MP4（H.264）</option>
                  <option value="webm">WebM（VP9 / VP8）</option>
                </select>
              </label>
              <label>
                <span>最大分辨率</span>
                <select
                  value={resolution}
                  disabled={compressing}
                  onChange={(event) =>
                    setResolution(event.target.value as ResolutionLimit)
                  }
                >
                  <option value="original">保持原始分辨率</option>
                  <option value="1080">1080P</option>
                  <option value="720">720P</option>
                  <option value="480">480P</option>
                </select>
              </label>
              <label>
                <span>最大帧率</span>
                <select
                  value={frameRate}
                  disabled={compressing}
                  onChange={(event) =>
                    setFrameRate(event.target.value as FrameRateLimit)
                  }
                >
                  <option value="original">保持原始帧率</option>
                  <option value="30">最高30 FPS</option>
                  <option value="24">最高24 FPS</option>
                </select>
              </label>
              <label className="video-compressor-audio">
                <span>声音</span>
                <span className="video-compressor-check">
                  <input
                    type="checkbox"
                    checked={Boolean(keepAudio && metadata?.hasAudio)}
                    disabled={compressing || !metadata?.hasAudio}
                    onChange={(event) => setKeepAudio(event.target.checked)}
                  />
                  {metadata
                    ? metadata.hasAudio
                      ? "保留视频声音"
                      : "原视频没有声音"
                    : "选择视频后检测声音"}
                </span>
              </label>
              <label className="video-compressor-quality">
                <span>
                  压缩质量
                  <strong>{quality}% · {qualityLabel(quality)}</strong>
                </span>
                <input
                  type="range"
                  min="20"
                  max="90"
                  step="1"
                  value={quality}
                  disabled={compressing}
                  onChange={(event) => setQuality(Number(event.target.value))}
                  aria-label="压缩质量"
                />
              </label>
            </div>

            <div className="video-compressor-summary">
              <span>
                <small>输出画面</small>
                <strong>
                  {compressionPlan
                    ? `${compressionPlan.width}×${compressionPlan.height} · ${compressionPlan.frameRate.toFixed(0)} FPS`
                    : "等待视频"}
                </strong>
              </span>
              <span>
                <small>目标视频码率</small>
                <strong>
                  {compressionPlan
                    ? `${(compressionPlan.videoBitrate / 1_000_000).toFixed(1)} Mbps`
                    : "—"}
                </strong>
              </span>
              <span>
                <small>预计体积</small>
                <strong>
                  {compressionPlan
                    ? `约 ${formatFileSize(compressionPlan.estimatedSize)}`
                    : "—"}
                </strong>
              </span>
            </div>

            <p className="video-compressor-note">
              {metadata
                ? `原视频：${metadata.codec} · ${metadata.frameRate.toFixed(1)} FPS。实际文件大小会因画面复杂度和浏览器编码器而变化。`
                : "选择视频后会显示编码、帧率与预计压缩体积。"}
            </p>

            <button
              className="convert-button video-gif-convert"
              type="submit"
              disabled={compressing || reading || !metadata || !compressionPlan}
            >
              {compressing ? "正在压缩…" : "开始压缩"}
            </button>
        </form>

        {status ? (
          <div className="video-gif-progress" role="status" aria-live="polite">
            <div>
              <span>{status}</span>
              <strong>{progress}%</strong>
            </div>
            <progress max="100" value={progress}>{progress}%</progress>
          </div>
        ) : null}

        {message ? <p className="message" role="alert">{message}</p> : null}

        <section className="video-compressor-result" aria-labelledby="video-compressor-result-title">
            <div className="video-gif-result-header">
              <div>
                <h2 id="video-compressor-result-title">压缩结果</h2>
                {result ? (
                  <span>
                    {result.format.toUpperCase()} · {formatFileSize(result.size)} · {result.width}×{result.height} · {result.frameRate.toFixed(0)} FPS
                    {savedBytes > 0 ? ` · 减少${savedPercent}%` : " · 输出体积未减小"}
                  </span>
                ) : <span>等待压缩</span>}
              </div>
              {result ? (
                <a className="gif-download-button" href={result.url} download={result.name}>
                  <FiDownload aria-hidden="true" />
                  下载视频
                </a>
              ) : null}
            </div>
            {result ? (
              <video className="video-compressor-result-video" src={result.url} controls playsInline preload="metadata" />
            ) : (
              <div className="file-tool-empty result-preview-empty">
                <FiFilm aria-hidden="true" />
                <strong>压缩后的视频会显示在这里</strong>
                <span>选择视频并完成压缩后即可预览</span>
              </div>
            )}
        </section>
      </section>
    </main>
  );
}
