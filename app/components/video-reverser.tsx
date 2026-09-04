"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiFilm, FiRefreshCw, FiUploadCloud, FiX } from "react-icons/fi";
import {
  containVideoSize,
  createReverseFrameTimes,
  createReversedName,
  formatMediaDuration,
  formatMediaSize,
  validateVideoReverseFile,
} from "../lib/media-reversal";
import { FileDropZone } from "./file-drop-zone";

type VideoInfo = {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  hasAudio: boolean;
};

type VideoSource = VideoInfo & { file: File; url: string };

async function decodeReversedAudio(file: File) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const channels = Math.min(2, decoded.numberOfChannels);
    const reversed = context.createBuffer(channels, decoded.length, decoded.sampleRate);
    for (let channel = 0; channel < channels; channel += 1) {
      const input = decoded.getChannelData(channel);
      const output = reversed.getChannelData(channel);
      for (let index = 0; index < input.length; index += 1) {
        output[index] = input[input.length - index - 1];
      }
    }
    return reversed;
  } finally {
    await context.close().catch(() => undefined);
  }
}

export default function VideoReverser() {
  const [source, setSource] = useState<VideoSource | null>(null);
  const [result, setResult] = useState<{ url: string; size: number; name: string } | null>(null);
  const [frameRate, setFrameRate] = useState(18);
  const [maxEdge, setMaxEdge] = useState(720);
  const [keepAudio, setKeepAudio] = useState(true);
  const [phase, setPhase] = useState<"idle" | "reading" | "reversing">("idle");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const urls = useRef({ source: "", result: "" });
  const controllerRef = useRef<AbortController | null>(null);
  const outputRef = useRef<{ cancel: () => Promise<void> } | null>(null);
  const busy = phase !== "idle";
  const outputSize = useMemo(
    () => source ? containVideoSize(source.width, source.height, maxEdge) : null,
    [maxEdge, source],
  );

  useEffect(() => () => {
    controllerRef.current?.abort();
    void outputRef.current?.cancel();
    if (urls.current.source) URL.revokeObjectURL(urls.current.source);
    if (urls.current.result) URL.revokeObjectURL(urls.current.result);
  }, []);

  function clearResult() {
    if (urls.current.result) URL.revokeObjectURL(urls.current.result);
    urls.current.result = "";
    setResult(null);
    setProgress(0);
    setStatus("");
  }

  function changeSetting(action: () => void) {
    if (busy) return;
    clearResult();
    setError("");
    action();
  }

  async function selectVideo(file: File) {
    if (busy) return;
    const validationError = validateVideoReverseFile(file);
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
    controllerRef.current = controller;
    let input: { dispose: () => void } | null = null;

    try {
      const media = await import("mediabunny");
      const mediaInput = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS });
      input = mediaInput;
      const track = await mediaInput.getPrimaryVideoTrack();
      if (!track) throw new Error("文件中没有可识别的视频轨道");
      if (!(await track.canDecode())) throw new Error("当前浏览器无法解码这个视频编码");
      const audioTrack = await mediaInput.getPrimaryAudioTrack();
      const [duration, width, height, stats] = await Promise.all([
        mediaInput.computeDuration([track]),
        track.getDisplayWidth(),
        track.getDisplayHeight(),
        track.computePacketStats(120),
      ]);
      if (!duration || !width || !height) throw new Error("无法读取这个视频的完整信息");
      if (duration > 600) throw new Error("视频倒放目前支持最长10分钟的视频");
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(file);
      urls.current.source = url;
      setSource({
        file,
        url,
        duration,
        width,
        height,
        frameRate: stats.averagePacketRate || 30,
        hasAudio: Boolean(audioTrack),
      });
      setKeepAudio(Boolean(audioTrack));
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? `${cause.message}。请更换视频或浏览器后重试。` : "无法读取这个视频文件。");
      }
    } finally {
      input?.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!controller.signal.aborted) setPhase("idle");
    }
  }

  async function reverseVideo() {
    if (!source || !outputSize || busy) return;
    clearResult();
    setError("");
    setStatus("正在准备视频倒放…");
    setProgress(1);
    setPhase("reversing");
    const controller = new AbortController();
    controllerRef.current = controller;
    let input: { dispose: () => void } | null = null;
    let audioWarning = "";

    try {
      const media = await import("mediabunny");
      const mediaInput = new media.Input({ source: new media.BlobSource(source.file), formats: media.ALL_FORMATS });
      input = mediaInput;
      const track = await mediaInput.getPrimaryVideoTrack();
      if (!track) throw new Error("没有找到视频轨道");

      const videoCodec = await media.getFirstEncodableVideoCodec(["vp9", "vp8"], {
        width: outputSize.width,
        height: outputSize.height,
        bitrate: Math.max(1_000_000, outputSize.width * outputSize.height * frameRate * 0.16),
      });
      if (!videoCodec) throw new Error("当前浏览器不支持视频倒放所需的WebM编码");

      let reversedAudio: AudioBuffer | null = null;
      if (keepAudio && source.hasAudio) {
        setStatus("正在准备倒放音轨…");
        try {
          reversedAudio = await decodeReversedAudio(source.file);
          const canEncode = await media.canEncodeAudio("opus", {
            numberOfChannels: reversedAudio.numberOfChannels,
            sampleRate: reversedAudio.sampleRate,
            bitrate: 128_000,
          });
          if (!canEncode) {
            reversedAudio = null;
            audioWarning = "当前浏览器无法编码倒放音轨，已生成无声视频。";
          }
        } catch {
          reversedAudio = null;
          audioWarning = "当前浏览器无法读取原视频音轨，已生成无声视频。";
        }
      }
      if (controller.signal.aborted) throw new Error("已取消视频倒放");

      const canvas = document.createElement("canvas");
      canvas.width = outputSize.width;
      canvas.height = outputSize.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("当前浏览器无法创建视频处理画布");

      const target = new media.BufferTarget();
      const output = new media.Output({ format: new media.WebMOutputFormat(), target });
      outputRef.current = output;
      const videoSource = new media.CanvasSource(canvas, {
        codec: videoCodec,
        bitrate: Math.max(1_000_000, outputSize.width * outputSize.height * frameRate * 0.16),
        keyFrameInterval: 2,
      });
      output.addVideoTrack(videoSource, { frameRate });

      let audioSource: InstanceType<typeof media.AudioBufferSource> | null = null;
      if (reversedAudio) {
        audioSource = new media.AudioBufferSource({ codec: "opus", bitrate: 128_000 });
        output.addAudioTrack(audioSource);
      }
      await output.start();

      const audioPromise = reversedAudio && audioSource ? audioSource.add(reversedAudio) : Promise.resolve();
      const sink = new media.VideoSampleSink(track);
      const times = createReverseFrameTimes(source.duration, frameRate);
      let written = 0;
      let timeIndex = 0;
      const chunkSeconds = 1;
      for (let chunkEnd = source.duration; chunkEnd > 0 && timeIndex < times.length; chunkEnd -= chunkSeconds) {
        if (controller.signal.aborted) throw new Error("已取消视频倒放");
        const chunkStart = Math.max(0, chunkEnd - chunkSeconds);
        const chunk = [] as typeof times;
        while (timeIndex < times.length && times[timeIndex].sourceTime >= chunkStart) {
          chunk.push(times[timeIndex]);
          timeIndex += 1;
        }
        const decoded = [] as Array<InstanceType<typeof media.VideoSample>>;
        const ascendingTimes = chunk.map((timing) => timing.sourceTime).reverse();
        for await (const sample of sink.samplesAtTimestamps(ascendingTimes)) {
          if (sample) decoded.push(sample);
        }
        decoded.reverse();
        for (let index = 0; index < decoded.length; index += 1) {
          if (controller.signal.aborted) {
            decoded.slice(index).forEach((sample) => sample.close());
            throw new Error("已取消视频倒放");
          }
          const sample = decoded[index];
          try {
            context.fillStyle = "#000";
            context.fillRect(0, 0, canvas.width, canvas.height);
            sample.draw(context, 0, 0, canvas.width, canvas.height);
          } finally {
            sample.close();
          }
          await videoSource.add(written / frameRate, 1 / frameRate, {
            keyFrame: written % Math.max(1, frameRate * 2) === 0,
          });
          written += 1;
          const nextProgress = Math.max(2, Math.min(98, Math.round((timeIndex / times.length) * 98)));
          setProgress(nextProgress);
          setStatus(`正在倒放视频帧 ${Math.min(timeIndex, times.length)}/${times.length}`);
        }
      }
      if (!written) throw new Error("没有读取到可倒放的视频画面");
      await audioPromise;
      setStatus("正在封装倒放视频…");
      await output.finalize();
      if (!target.buffer) throw new Error("没有生成倒放视频");

      const blob = new Blob([target.buffer], { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      urls.current.result = url;
      setResult({ url, size: blob.size, name: createReversedName(source.file.name, "video") });
      setProgress(100);
      setStatus(audioWarning ? `倒放完成。${audioWarning}` : "倒放完成");
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? `${cause.message}。` : "视频倒放失败，请更换视频或浏览器后重试。");
      }
      setProgress(0);
      setStatus(controller.signal.aborted ? "已取消视频倒放" : "");
    } finally {
      input?.dispose();
      outputRef.current = null;
      if (controllerRef.current === controller) controllerRef.current = null;
      setPhase("idle");
    }
  }

  async function cancel() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    await outputRef.current?.cancel().catch(() => undefined);
    outputRef.current = null;
    setPhase("idle");
    setProgress(0);
    setStatus("已取消视频倒放");
  }

  return (
    <main className="tool-shell video-reverser-shell">
      <Link className="back-link" href="/"><span aria-hidden="true">←</span> 多功能工具箱</Link>
      <header className="tool-header">
        <h1>视频倒放工具</h1>
        <p className="video-tool-description">将视频画面和声音反向处理，导出可直接播放的WebM视频。</p>
      </header>

      <section className="converter-card video-reverser-card" aria-label="视频倒放" aria-busy={busy}>
        <FileDropZone className="video-file-picker" accept="video/*,.mkv,.mov,.m4v,.ogv,.avi,.mpeg,.mpg,.ts,.mts,.m2ts" ariaLabel="选择或拖入视频" disabled={busy} onFile={selectVideo}>
          <FiUploadCloud aria-hidden="true" />
          <strong>{phase === "reading" ? "正在读取视频…" : source ? "重新选择视频" : "选择视频"}</strong>
          <span>点击选择或拖入视频，支持MP4、WebM、MOV、MKV等格式，最大500 MB</span>
        </FileDropZone>

        <div className="reverse-tool-grid">
          <section className="reverse-tool-panel" aria-label="原视频">
            <div className="reverse-tool-heading"><h2>原视频</h2><span>{source ? `${formatMediaSize(source.file.size)} · ${formatMediaDuration(source.duration)}` : "等待选择"}</span></div>
            {source ? <video controls playsInline preload="metadata" src={source.url} /> : <div className="file-tool-empty"><FiFilm aria-hidden="true" /><strong>原视频预览</strong><span>选择视频后可在这里预览</span></div>}
          </section>
          <section className="reverse-tool-panel" aria-label="倒放结果">
            <div className="reverse-tool-heading"><h2>倒放结果</h2><span>{result ? `${formatMediaSize(result.size)} · WebM` : "等待处理"}</span></div>
            {result ? <><video controls playsInline preload="metadata" src={result.url} /><a className="gif-download-button" href={result.url} download={result.name}><FiDownload aria-hidden="true" />下载倒放视频</a></> : <div className="file-tool-empty"><FiRefreshCw aria-hidden="true" /><strong>倒放后的视频</strong><span>处理完成后可预览和下载</span></div>}
          </section>
        </div>

        <section className="video-reverser-settings" aria-label="倒放设置">
          <div className="reverse-tool-heading"><h2>倒放设置</h2><span>{outputSize ? `输出 ${outputSize.width}×${outputSize.height}` : "选择视频后可设置"}</span></div>
          <div className="video-reverser-setting-grid">
            <label><span>输出清晰度</span><select value={maxEdge} disabled={!source || busy} onChange={(event) => changeSetting(() => setMaxEdge(Number(event.target.value)))}><option value="480">流畅 480P</option><option value="720">清晰 720P</option><option value="1080">高清 1080P</option></select></label>
            <label><span>输出帧率</span><select value={frameRate} disabled={!source || busy} onChange={(event) => changeSetting(() => setFrameRate(Number(event.target.value)))}><option value="12">12 FPS（更快）</option><option value="18">18 FPS（推荐）</option><option value="24">24 FPS（更流畅）</option></select></label>
          </div>
          <label className="video-reverser-audio"><input type="checkbox" checked={Boolean(keepAudio && source?.hasAudio)} disabled={!source?.hasAudio || busy} onChange={(event) => changeSetting(() => setKeepAudio(event.target.checked))} /><span>同时倒放声音{source && !source.hasAudio ? "（原视频无声音）" : ""}</span></label>
        </section>

        <button className="convert-button" type="button" disabled={!source || busy} onClick={reverseVideo}><FiRefreshCw aria-hidden="true" />{phase === "reversing" ? `正在倒放 ${progress}%` : "开始视频倒放"}</button>
        {busy ? <button className="reverse-tool-cancel" type="button" onClick={cancel}><FiX aria-hidden="true" />取消处理</button> : null}
        {phase === "reversing" ? <progress className="reverse-tool-progress" max="100" value={progress}>{progress}%</progress> : null}
        {error ? <p className="reverse-tool-error" role="alert">{error}</p> : null}
        {status ? <p className="reverse-tool-status" role="status">{status}</p> : null}
      </section>
    </main>
  );
}
