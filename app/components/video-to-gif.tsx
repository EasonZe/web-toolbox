"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { FiDownload, FiImage, FiUploadCloud } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";

const maxClipDuration = 12;
const frameRateOptions = [6, 8, 10, 12];
const widthOptions = [320, 480, 640];

type GifResult = {
  url: string;
  size: number;
  name: string;
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
};

const videoFrameTimeout = 1500;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function waitForVideoFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const callbackVideo = video as VideoWithFrameCallback;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(finish, videoFrameTimeout);

    if (callbackVideo.requestVideoFrameCallback) {
      callbackVideo.requestVideoFrameCallback(finish);
      return;
    }
    window.requestAnimationFrame(finish);
  });
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.008 && video.readyState >= 2) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("读取视频帧超时"));
    }, 10000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("无法读取视频画面"));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = time;
  });

  await Promise.race([
    waitForVideoFrame(video),
    new Promise<void>((resolve) =>
      window.setTimeout(resolve, videoFrameTimeout),
    ),
  ]);
}

export default function VideoToGif() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceUrlRef = useRef("");
  const resultUrlRef = useRef("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [clipDuration, setClipDuration] = useState(3);
  const [outputWidth, setOutputWidth] = useState(480);
  const [frameRate, setFrameRate] = useState(8);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState<GifResult | null>(null);

  const availableDuration = useMemo(
    () => Math.max(0, videoDuration - startTime),
    [startTime, videoDuration],
  );

  useEffect(() => {
    return () => {
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
      /\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(selectedFile.name);
    if (!looksLikeVideo) {
      setMessage("请选择常见的视频文件。");
      return;
    }

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    clearResult();

    const nextSourceUrl = URL.createObjectURL(selectedFile);
    sourceUrlRef.current = nextSourceUrl;
    setFile(selectedFile);
    setSourceUrl(nextSourceUrl);
    setVideoDuration(0);
    setStartTime(0);
    setClipDuration(3);
    setMessage("");
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) {
      setMessage("无法读取这个视频的信息，请更换文件后重试。");
      return;
    }

    setVideoDuration(video.duration);
    setClipDuration(Math.min(3, video.duration, maxClipDuration));
    setMessage("");
  }

  async function handleConvert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!file || !video || !canvas || !videoDuration) {
      setMessage("请先选择一个视频文件。");
      return;
    }

    const safeStart = clamp(startTime, 0, Math.max(0, videoDuration - 0.05));
    const safeDuration = clamp(
      clipDuration,
      0.1,
      Math.min(maxClipDuration, videoDuration - safeStart),
    );
    const targetWidth = Math.min(outputWidth, video.videoWidth);
    const targetHeight = Math.max(
      1,
      Math.round((video.videoHeight / video.videoWidth) * targetWidth),
    );
    const totalFrames = Math.max(1, Math.floor(safeDuration * frameRate));
    const frameDelay = Math.round(1000 / frameRate);

    video.pause();
    clearResult();
    setConverting(true);
    setMessage("");
    setStatus("正在准备视频画面…");

    try {
      const { GIFEncoder, applyPalette, quantize } = await import("gifenc");
      const context = canvas.getContext("2d", {
        alpha: false,
        willReadFrequently: true,
      });
      if (!context) throw new Error("浏览器不支持画面转换");

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const gif = GIFEncoder();

      for (let frame = 0; frame < totalFrames; frame += 1) {
        const timestamp = Math.min(
          safeStart + frame / frameRate,
          Math.max(0, videoDuration - 0.001),
        );
        await seekVideo(video, timestamp);
        context.drawImage(video, 0, 0, targetWidth, targetHeight);

        const imageData = context.getImageData(
          0,
          0,
          targetWidth,
          targetHeight,
        );
        const palette = quantize(imageData.data, 192);
        const indexedFrame = applyPalette(imageData.data, palette);
        gif.writeFrame(indexedFrame, targetWidth, targetHeight, {
          palette,
          delay: frameDelay,
          repeat: 0,
        });

        const nextProgress = Math.round(((frame + 1) / totalFrames) * 100);
        setProgress(nextProgress);
        setStatus(`正在转换第 ${frame + 1} / ${totalFrames} 帧`);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }

      gif.finish();
      const bytes = gif.bytes();
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([buffer], { type: "image/gif" });
      const resultUrl = URL.createObjectURL(blob);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "video";
      const name = `${baseName}.gif`;

      resultUrlRef.current = resultUrl;
      setResult({ url: resultUrl, size: blob.size, name });
      setStatus("转换完成");
      setProgress(100);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `${error.message}，请缩短片段或降低宽度后重试。`
          : "转换失败，请缩短片段或降低宽度后重试。",
      );
      setStatus("");
      setProgress(0);
    } finally {
      setConverting(false);
    }
  }

  return (
    <main className="tool-shell video-gif-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> Eason的工具箱
      </Link>

      <header className="tool-header video-gif-header">
        <h1>视频转GIF工具</h1>
        <p>截取视频片段并转换为GIF。</p>
      </header>

      <section
        className="converter-card video-gif-card"
        aria-label="视频转GIF"
        aria-busy={converting}
      >
        <FileDropZone
          className="video-file-picker"
          accept="video/*"
          disabled={converting}
          onFile={handleFileChange}
          ariaLabel="选择或拖入视频"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{file ? "重新选择视频" : "选择视频"}</strong>
          <span>点击选择或拖入视频，支持MP4、WebM、MOV等格式</span>
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
              <FiImage aria-hidden="true" />
              <strong>视频预览</strong>
              <span>选择视频后在这里预览原视频</span>
            </div>
          )}
        </div>

        <form className="video-gif-form" onSubmit={handleConvert}>
              <div className="video-gif-options">
                <label>
                  <span>开始时间（秒）</span>
                  <input
                    type="number"
                    min="0"
                    max={Math.max(0, videoDuration - 0.05)}
                    step="0.1"
                    value={startTime}
                    disabled={converting || !videoDuration}
                    onChange={(event) => {
                      const nextStart = clamp(
                        Number(event.target.value) || 0,
                        0,
                        Math.max(0, videoDuration - 0.05),
                      );
                      setStartTime(nextStart);
                      setClipDuration((current) =>
                        Math.min(
                          current,
                          maxClipDuration,
                          Math.max(0.1, videoDuration - nextStart),
                        ),
                      );
                    }}
                  />
                </label>
                <label>
                  <span>片段时长（最多12秒）</span>
                  <input
                    type="number"
                    min="0.1"
                    max={Math.min(maxClipDuration, availableDuration)}
                    step="any"
                    value={clipDuration}
                    disabled={converting || !videoDuration}
                    onChange={(event) =>
                      setClipDuration(
                        clamp(
                          Number(event.target.value) || 0.1,
                          0.1,
                          Math.min(maxClipDuration, availableDuration),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>GIF宽度</span>
                  <select
                    value={outputWidth}
                    disabled={converting}
                    onChange={(event) =>
                      setOutputWidth(Number(event.target.value))
                    }
                  >
                    {widthOptions.map((width) => (
                      <option value={width} key={width}>
                        {width}px
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>帧率</span>
                  <select
                    value={frameRate}
                    disabled={converting}
                    onChange={(event) =>
                      setFrameRate(Number(event.target.value))
                    }
                  >
                    {frameRateOptions.map((fps) => (
                      <option value={fps} key={fps}>
                        {fps} FPS
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                className="convert-button video-gif-convert"
                type="submit"
                disabled={converting || !videoDuration}
              >
                {converting ? "正在转换…" : "转换为GIF"}
              </button>
        </form>

        {status ? (
          <div className="video-gif-progress" role="status" aria-live="polite">
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

        <section className="video-gif-result" aria-labelledby="gif-result-title">
          <div className="video-gif-result-header">
            <div>
              <h2 id="gif-result-title">GIF预览</h2>
              <span>{result ? formatFileSize(result.size) : "等待转换"}</span>
            </div>
            {result ? (
              <a className="gif-download-button" href={result.url} download={result.name}>
                <FiDownload aria-hidden="true" />
                下载GIF
              </a>
            ) : null}
          </div>
          {result ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.url} alt="转换后的GIF预览" />
          ) : (
            <div className="file-tool-empty result-preview-empty">
              <FiImage aria-hidden="true" />
              <strong>GIF会显示在这里</strong>
              <span>选择视频并完成转换后即可预览</span>
            </div>
          )}
        </section>
      </section>

      <canvas ref={canvasRef} className="video-gif-canvas" aria-hidden="true" />
    </main>
  );
}
