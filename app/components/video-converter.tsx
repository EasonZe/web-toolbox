"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiFilm, FiRefreshCw, FiTrash2, FiUploadCloud, FiX } from "react-icons/fi";
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

type VideoQueueStatus = "reading" | "ready" | "converting" | "done" | "error";

type VideoQueueItem = {
  id: string;
  file: File;
  sourceUrl: string;
  metadata: VideoMetadata | null;
  result: VideoResult | null;
  status: VideoQueueStatus;
  progress: number;
  message: string;
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

function queueStatusText(item: VideoQueueItem) {
  if (item.status === "reading") return "正在读取视频信息";
  if (item.status === "converting") return `正在转换 · ${item.progress}%`;
  if (item.status === "done") return `转换完成 · ${item.result ? formatFileSize(item.result.size) : "可下载"}`;
  if (item.status === "error") return item.message || "处理失败";
  if (!item.metadata) return "等待读取";
  return `${formatDuration(item.metadata.duration)} · ${item.metadata.width}×${item.metadata.height} · ${item.metadata.frameRate.toFixed(1)} FPS`;
}

export default function VideoConverter() {
  const itemsRef = useRef<VideoQueueItem[]>([]);
  const conversionRef = useRef<{ cancel: () => Promise<void> } | null>(null);
  const cancelRequestedRef = useRef(false);
  const [items, setItems] = useState<VideoQueueItem[]>([]);
  const [activeId, setActiveId] = useState("");
  const [outputFormat, setOutputFormat] = useState<VideoOutputFormat>("mp4");
  const [resolution, setResolution] = useState<VideoResolution>("original");
  const [frameRate, setFrameRate] = useState<VideoFrameRate>("original");
  const [quality, setQuality] = useState(78);
  const [keepAudio, setKeepAudio] = useState(true);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => () => {
    itemsRef.current.forEach((item) => {
      URL.revokeObjectURL(item.sourceUrl);
      if (item.result) URL.revokeObjectURL(item.result.url);
    });
    void conversionRef.current?.cancel();
  }, []);

  function replaceItems(next: VideoQueueItem[]) {
    itemsRef.current = next;
    setItems(next);
  }

  function updateItem(id: string, update: (item: VideoQueueItem) => VideoQueueItem) {
    replaceItems(itemsRef.current.map((item) => item.id === id ? update(item) : item));
  }

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? items[0] ?? null,
    [activeId, items],
  );
  const metadata = activeItem?.metadata ?? null;
  const result = activeItem?.result ?? null;
  const reading = items.some((item) => item.status === "reading");
  const readyCount = items.filter((item) => item.metadata).length;
  const completedCount = items.filter((item) => item.status === "done").length;
  const busy = converting;

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

  async function readMetadata(item: VideoQueueItem) {
    let input: { dispose: () => void } | null = null;
    try {
      const media = await import("mediabunny");
      const mediaInput = new media.Input({
        source: new media.BlobSource(item.file),
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
      updateItem(item.id, (current) => ({
        ...current,
        metadata: {
          duration,
          width,
          height,
          frameRate: stats.averagePacketRate || 30,
          codec: codec ? (codecNames[codec] ?? codec.toUpperCase()) : "未知",
          hasAudio: Boolean(audioTrack),
        },
        status: "ready",
        message: "",
      }));
    } catch (cause) {
      updateItem(item.id, (current) => ({
        ...current,
        status: "error",
        message: cause instanceof Error ? `${cause.message}。` : "无法读取这个视频文件。",
      }));
    } finally {
      input?.dispose();
    }
  }

  function addFiles(selectedFiles: File[]) {
    if (converting) return;
    const rejected: string[] = [];
    const accepted = selectedFiles.flatMap((selectedFile, index) => {
      const validationError = validateVideoConversionFile(selectedFile);
      if (validationError) {
        rejected.push(`${selectedFile.name}：${validationError}`);
        return [];
      }
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${index}-${selectedFile.name}`;
      return [{
        id,
        file: selectedFile,
        sourceUrl: URL.createObjectURL(selectedFile),
        metadata: null,
        result: null,
        status: "reading" as const,
        progress: 0,
        message: "",
      }];
    });

    if (!accepted.length) {
      setMessage(rejected.length ? `${rejected.join("；")}。` : "没有可导入的视频文件。");
      return;
    }

    replaceItems([...itemsRef.current, ...accepted]);
    setActiveId((current) => current || accepted[0].id);
    setMessage(rejected.length ? `${rejected.join("；")}。其余视频已加入队列。` : "");
    accepted.forEach((item) => { void readMetadata(item); });
  }

  function removeItem(id: string) {
    if (converting) return;
    const removed = itemsRef.current.find((item) => item.id === id);
    if (!removed) return;
    URL.revokeObjectURL(removed.sourceUrl);
    if (removed.result) URL.revokeObjectURL(removed.result.url);
    const next = itemsRef.current.filter((item) => item.id !== id);
    replaceItems(next);
    if (activeId === id) setActiveId(next[0]?.id ?? "");
    setMessage("");
  }

  function clearQueue() {
    if (converting) return;
    itemsRef.current.forEach((item) => {
      URL.revokeObjectURL(item.sourceUrl);
      if (item.result) URL.revokeObjectURL(item.result.url);
    });
    replaceItems([]);
    setActiveId("");
    setProgress(0);
    setStatus("");
    setMessage("");
  }

  function clearAllResults() {
    const next = itemsRef.current.map((item) => {
      if (item.result) URL.revokeObjectURL(item.result.url);
      return {
        ...item,
        result: null,
        progress: 0,
        status: item.metadata ? "ready" as const : item.status,
        message: item.metadata ? "" : item.message,
      };
    });
    replaceItems(next);
    setProgress(0);
    setStatus("");
  }

  function changeSettings(action: () => void) {
    clearAllResults();
    setMessage("");
    action();
  }

  async function convertQueueItem(item: VideoQueueItem, position: number, total: number) {
    if (!item.metadata) return false;
    const itemPlan = createVideoConversionPlan({
      sourceWidth: item.metadata.width,
      sourceHeight: item.metadata.height,
      sourceFrameRate: item.metadata.frameRate,
      duration: item.metadata.duration,
      resolution,
      frameRate,
      quality,
      keepAudio,
      hasAudio: item.metadata.hasAudio,
    });
    let input: { dispose: () => void } | null = null;

    updateItem(item.id, (current) => ({ ...current, status: "converting", progress: 3, message: "" }));
    setStatus(`正在转换 ${position + 1}/${total}：${item.file.name}`);
    try {
      const media = await import("mediabunny");
      const profile = videoOutputProfiles[outputFormat];
      const videoCodec = await media.getFirstEncodableVideoCodec([...profile.videoCodecs], {
        width: itemPlan.width,
        height: itemPlan.height,
        bitrate: itemPlan.videoBitrate,
      });
      if (!videoCodec) throw new Error(`当前浏览器无法编码${profile.label}所需的视频编码`);
      if (keepAudio && item.metadata.hasAudio && !(await media.canEncodeAudio(profile.audioCodec, {
        numberOfChannels: 2,
        sampleRate: 48_000,
        bitrate: itemPlan.audioBitrate,
      }))) {
        throw new Error(`当前浏览器无法编码${profile.label}声音，请关闭保留声音后重试`);
      }

      const mediaInput = new media.Input({
        source: new media.BlobSource(item.file),
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
      const conversion = await media.Conversion.init({
        input: mediaInput,
        output,
        tracks: "primary",
        video: {
          codec: videoCodec,
          bitrate: itemPlan.videoBitrate,
          width: itemPlan.width,
          height: itemPlan.height,
          fit: "fill",
          frameRate: itemPlan.frameRate,
          keyFrameInterval: 3,
          hardwareAcceleration: "no-preference",
          forceTranscode: true,
        },
        audio: keepAudio && item.metadata.hasAudio
          ? {
              codec: profile.audioCodec,
              bitrate: itemPlan.audioBitrate,
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
        const itemProgress = Math.min(99, Math.max(6, Math.round(nextProgress * 100)));
        updateItem(item.id, (current) => ({ ...current, progress: itemProgress }));
        setProgress(Math.min(99, Math.round(((position + nextProgress) / total) * 100)));
      };
      await conversion.execute();
      if (!target.buffer) throw new Error("没有生成转换后的视频");

      const blob = new Blob([target.buffer], { type: profile.mimeType });
      const resultUrl = URL.createObjectURL(blob);
      updateItem(item.id, (current) => ({
        ...current,
        result: {
          url: resultUrl,
          name: createConvertedVideoName(item.file.name, outputFormat),
          size: blob.size,
          width: itemPlan.width,
          height: itemPlan.height,
          frameRate: itemPlan.frameRate,
          format: outputFormat,
        },
        status: "done",
        progress: 100,
        message: "",
      }));
      setProgress(Math.round(((position + 1) / total) * 100));
      return true;
    } catch (cause) {
      const canceled = cancelRequestedRef.current;
      updateItem(item.id, (current) => ({
        ...current,
        status: canceled && current.metadata ? "ready" : "error",
        progress: 0,
        message: canceled
          ? "已取消转换"
          : cause instanceof Error
            ? `${cause.message}。`
            : "视频格式转换失败。",
      }));
      return false;
    } finally {
      conversionRef.current = null;
      input?.dispose();
    }
  }

  async function convertVideos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (converting || reading) return;
    const targets = itemsRef.current.filter((item) => item.metadata);
    if (!targets.length) {
      setMessage("请先导入至少一个可以读取的视频文件。");
      return;
    }

    clearAllResults();
    const resetTargets = itemsRef.current.filter((item) => item.metadata);
    setConverting(true);
    setProgress(1);
    setStatus(`准备批量转换 ${resetTargets.length} 个视频…`);
    setMessage("");
    cancelRequestedRef.current = false;

    for (let index = 0; index < resetTargets.length; index += 1) {
      if (cancelRequestedRef.current) break;
      await convertQueueItem(resetTargets[index], index, resetTargets.length);
    }

    const targetIds = new Set(resetTargets.map((item) => item.id));
    const convertedItems = itemsRef.current.filter((item) => targetIds.has(item.id));
    const failedCount = convertedItems.filter((item) => item.status === "error").length;
    if (cancelRequestedRef.current) {
      setStatus("");
      setProgress(0);
      setMessage("已取消批量转换，已完成的视频仍可下载。");
    } else {
      setStatus(`批量转换完成 · ${convertedItems.filter((item) => item.status === "done").length}/${resetTargets.length}`);
      setProgress(100);
      setMessage(failedCount ? `${failedCount} 个视频转换失败，可在队列中查看原因并重试。` : "");
    }
    setConverting(false);
  }

  async function cancelConversion() {
    if (!converting) return;
    cancelRequestedRef.current = true;
    setStatus("正在取消批量转换…");
    await conversionRef.current?.cancel();
  }

  const selectedProfile = videoOutputProfiles[outputFormat];

  return (
    <main className="tool-shell video-converter-shell">
      <Link className="back-link" href="/"><span aria-hidden="true">←</span> 多功能工具箱</Link>
      <header className="tool-header video-converter-header">
        <h1>视频格式转换工具</h1>
        <p>支持批量导入视频，统一调整格式、画面大小、帧率与画质。</p>
      </header>

      <section className="converter-card video-converter-card" aria-label="视频格式转换" aria-busy={busy}>
        <FileDropZone
          className="video-file-picker"
          accept="video/*,.mkv,.mov,.m4v,.ogv,.avi,.mpeg,.mpg,.ts,.mts,.m2ts"
          disabled={busy}
          multiple
          onFiles={addFiles}
          ariaLabel="选择或拖入多个视频"
        >
          <FiUploadCloud aria-hidden="true" />
          <strong>{items.length ? "继续添加视频" : "批量选择视频"}</strong>
          <span>可一次选择或拖入多个视频，支持MP4、WebM、MOV、MKV等格式，单个最大500 MB</span>
        </FileDropZone>

        {items.length ? (
          <section className="video-converter-queue" aria-labelledby="video-converter-queue-title">
            <div className="video-converter-heading">
              <div>
                <h2 id="video-converter-queue-title">转换队列</h2>
                <span>{items.length} 个视频 · {readyCount} 个可转换 · {completedCount} 个已完成</span>
              </div>
              <button className="video-converter-clear" type="button" disabled={busy} onClick={clearQueue}><FiTrash2 aria-hidden="true" />清空</button>
            </div>
            <div className="video-converter-queue-list" role="list">
              {items.map((item) => (
                <div className={`video-converter-queue-item${activeItem?.id === item.id ? " is-active" : ""}`} role="listitem" key={item.id}>
                  <button className="video-converter-queue-select" type="button" aria-pressed={activeItem?.id === item.id} onClick={() => setActiveId(item.id)}>
                    <span className="video-converter-queue-icon" aria-hidden="true"><FiFilm /></span>
                    <span className="video-converter-queue-copy">
                      <strong>{item.file.name}</strong>
                      <small>{formatFileSize(item.file.size)} · {queueStatusText(item)}</small>
                      {item.status === "reading" || item.status === "converting" ? <progress max="100" value={item.status === "reading" ? undefined : item.progress} /> : null}
                    </span>
                  </button>
                  <span className="video-converter-queue-actions">
                    {item.result ? <a href={item.result.url} download={item.result.name} aria-label={`下载${item.result.name}`} title="下载转换结果"><FiDownload aria-hidden="true" /></a> : null}
                    <button type="button" disabled={busy} onClick={() => removeItem(item.id)} aria-label={`移除${item.file.name}`} title="移除"><FiX aria-hidden="true" /></button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="video-converter-source" aria-labelledby="video-converter-source-title">
          <div className="video-converter-heading">
            <div>
              <h2 id="video-converter-source-title">原视频预览</h2>
              <span>{activeItem ? `${activeItem.file.name} · ${formatFileSize(activeItem.file.size)}` : "等待选择视频"}</span>
            </div>
          </div>
          {activeItem ? (
            <>
              <video src={activeItem.sourceUrl} controls playsInline preload="metadata" />
              <div className="video-converter-source-meta">
                <span>{metadata ? `${formatDuration(metadata.duration)} · ${metadata.width}×${metadata.height}` : queueStatusText(activeItem)}</span>
                <span>{metadata ? `${metadata.codec} · ${metadata.frameRate.toFixed(1)} FPS · ${metadata.hasAudio ? "含声音" : "无声音"}` : "—"}</span>
              </div>
            </>
          ) : (
            <div className="file-tool-empty video-converter-empty">
              <FiFilm aria-hidden="true" />
              <strong>视频预览</strong>
              <span>批量导入后可从队列中切换预览</span>
            </div>
          )}
        </section>

        <form className="video-converter-form" onSubmit={convertVideos}>
          <div className="video-converter-workbench">
            <section className="video-converter-panel" aria-labelledby="video-converter-format-title">
              <div className="video-converter-heading">
                <div>
                  <h2 id="video-converter-format-title">目标格式</h2>
                  <span>统一应用到队列中的所有视频</span>
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
                      disabled={!readyCount || busy}
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
                  <select value={resolution} disabled={!readyCount || busy} onChange={(event) => changeSettings(() => setResolution(event.target.value as VideoResolution))}>
                    <option value="original">保持原始分辨率</option>
                    <option value="2160">最高2160P</option>
                    <option value="1080">最高1080P</option>
                    <option value="720">最高720P</option>
                    <option value="480">最高480P</option>
                  </select>
                </label>
                <label>
                  <span>输出帧率</span>
                  <select value={frameRate} disabled={!readyCount || busy} onChange={(event) => changeSettings(() => setFrameRate(event.target.value as VideoFrameRate))}>
                    <option value="original">保持原始帧率</option>
                    <option value="60">最高60 FPS</option>
                    <option value="30">最高30 FPS</option>
                    <option value="24">最高24 FPS</option>
                  </select>
                </label>
              </div>

              <label className="video-converter-quality">
                <span>输出画质 <strong>{quality}% · {qualityLabel(quality)}</strong></span>
                <input type="range" min="20" max="100" step="1" value={quality} disabled={!readyCount || busy} onChange={(event) => changeSettings(() => setQuality(Number(event.target.value)))} />
              </label>

              <label className="video-converter-audio">
                <input type="checkbox" checked={keepAudio} disabled={!readyCount || busy} onChange={(event) => changeSettings(() => setKeepAudio(event.target.checked))} />
                <span>尽可能保留视频声音（无音轨的视频会自动跳过）</span>
              </label>

              <div className="video-converter-summary">
                <span><small>当前预览输出</small><strong>{plan ? `${plan.width}×${plan.height} · ${plan.frameRate.toFixed(0)} FPS` : "等待视频"}</strong></span>
                <span><small>视频码率</small><strong>{plan ? `${(plan.videoBitrate / 1_000_000).toFixed(1)} Mbps` : "—"}</strong></span>
                <span><small>队列数量</small><strong>{readyCount ? `${readyCount} 个可转换` : "—"}</strong></span>
              </div>

              <button className="convert-button video-converter-submit" type="submit" disabled={!readyCount || reading || busy}>
                <FiRefreshCw aria-hidden="true" />{converting ? "正在批量转换…" : `批量转换 ${readyCount} 个视频为${selectedProfile.label}`}
              </button>
              {converting ? (
                <button className="video-converter-cancel" type="button" onClick={cancelConversion}><FiX aria-hidden="true" />取消批量转换</button>
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
              <h2 id="video-converter-result-title">当前视频转换结果</h2>
              <span>{result ? `${videoOutputProfiles[result.format].label} · ${formatFileSize(result.size)} · ${result.width}×${result.height} · ${result.frameRate.toFixed(0)} FPS` : completedCount ? `已完成 ${completedCount} 个，请从队列切换查看` : "等待转换"}</span>
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
              <span>批量转换完成后，可从队列逐个预览和下载</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
