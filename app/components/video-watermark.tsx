"use client";

import { useEffect, useRef, useState } from "react";
import { FiUploadCloud, FiDownload } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import { UtilityShell } from "./utility-shell";
import { defaultWatermark, drawWatermark, type WatermarkSettings } from "../lib/video-watermark";

export default function VideoWatermark() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [settings, setSettings] = useState<WatermarkSettings>(defaultWatermark);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [logoName, setLogoName] = useState("");
  const [format, setFormat] = useState("mp4");
  const [quality, setQuality] = useState(75);
  const [keepAudio, setKeepAudio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ url: string; name: string; size: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef("");
  const resultRef = useRef("");
  const logoRef = useRef("");
  const logoJob = useRef(0);
  const job = useRef(0);
  const converting = useRef(false);
  const cancelled = useRef(false);
  const conversion = useRef<{ cancel: () => Promise<void> } | null>(null);

  useEffect(() => () => {
    job.current++; logoJob.current++; cancelled.current = true;
    void conversion.current?.cancel().catch(() => {});
    [sourceRef.current, resultRef.current, logoRef.current].forEach((url) => { if (url) URL.revokeObjectURL(url); });
  }, []);
  useEffect(() => {
    if (!canvas.current || !dimensions.width) return;
    canvas.current.width = dimensions.width; canvas.current.height = dimensions.height;
    const ctx = canvas.current.getContext("2d");
    if (ctx) { ctx.clearRect(0, 0, dimensions.width, dimensions.height); drawWatermark(ctx, dimensions.width, dimensions.height, settings, logo); }
  }, [dimensions, logo, settings]);
  function clearResult() {
    if (resultRef.current) URL.revokeObjectURL(resultRef.current);
    resultRef.current = ""; setResult(null); setMessage(""); setProgress(0);
  }
  function change(patch: Partial<WatermarkSettings>) { clearResult(); setSettings((v) => ({ ...v, ...patch })); }
  function selectVideo(selected: File) {
    if (converting.current) return;
    if (!selected.size || selected.size > 300 * 1024 * 1024) { setMessage("请选择300 MB以内的视频。"); return; }
    if (!selected.type.startsWith("video/") && !/\.(mp4|webm|mov|mkv|m4v)$/i.test(selected.name)) { setMessage("请选择MP4、WebM、MOV等视频文件。"); return; }
    clearResult(); setDimensions({ width: 0, height: 0 });
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current);
    sourceRef.current = URL.createObjectURL(selected); setSource(sourceRef.current); setFile(selected);
  }
  async function selectLogo(file: File) {
    if (converting.current) return;
    const current = ++logoJob.current;
    setLogo(null); setLogoName("正在读取图片…"); clearResult();
    let nextUrl = "";
    try {
      if (file.size > 10 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("请使用10 MB以内的PNG、JPG或WebP图片。");
      nextUrl = URL.createObjectURL(file);
      const image = new Image(); image.src = nextUrl; await image.decode();
      if (current !== logoJob.current) { URL.revokeObjectURL(nextUrl); return; }
      if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("水印图片过大，请缩小后重试。");
      if (logoRef.current) URL.revokeObjectURL(logoRef.current);
      logoRef.current = nextUrl; setLogo(image); setLogoName(file.name); clearResult();
    } catch (e) { if (nextUrl) URL.revokeObjectURL(nextUrl); if (current === logoJob.current) { setLogoName(""); setMessage(e instanceof Error ? e.message : "无法读取水印图片。"); } }
  }
  async function processVideo() {
    if (!file || converting.current || !dimensions.width) return;
    if (settings.type === "text" ? !settings.text.trim() : !logo) { setMessage("请先填写水印文字或选择水印图片。"); return; }
    clearResult(); const current = ++job.current; converting.current = true; cancelled.current = false;
    setBusy(true); setMessage("正在准备视频…");
    let input: { dispose: () => void } | null = null;
    let timedOut = false;
    // This function runs only after clicking export, never during rendering.
    // eslint-disable-next-line react-hooks/purity
    let lastProgress = performance.now();
    const checkCancelled = () => { if (current !== job.current || cancelled.current) throw new Error(timedOut ? "处理长时间无响应，请换用WebM格式或缩短视频后重试。" : "已取消处理"); };
    const timer = setInterval(() => {
      if (performance.now() - lastProgress > 120000) { timedOut = true; cancelled.current = true; void conversion.current?.cancel().catch(() => {}); }
    }, 5000);
    try {
      const media = await import("mediabunny"); checkCancelled();
      const mediaInput = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS }); input = mediaInput;
      const track = await mediaInput.getPrimaryVideoTrack(); checkCancelled();
      if (!track || !await track.canDecode()) throw new Error("当前浏览器无法解码这个视频，请更换视频后重试。");
      const originalWidth = await track.getDisplayWidth(), originalHeight = await track.getDisplayHeight();
      const scale = Math.min(1, 1920 / Math.max(originalWidth, originalHeight));
      const width = Math.max(2, Math.floor(originalWidth * scale / 2) * 2), height = Math.max(2, Math.floor(originalHeight * scale / 2) * 2);
      const codec = await media.getFirstEncodableVideoCodec(format === "mp4" ? ["avc"] : ["vp9", "vp8"], { width, height });
      if (!codec) throw new Error("当前浏览器不支持此输出格式，请切换MP4/WebM后重试。");
      const audioTrack = await mediaInput.getPrimaryAudioTrack();
      const audioCodec = format === "mp4" ? "aac" : "opus";
      if (keepAudio && audioTrack && !await media.canEncodeAudio(audioCodec, { numberOfChannels: 2, sampleRate: 48000 })) throw new Error("当前浏览器无法编码此格式的声音，请改为WebM或取消保留声音。");
      checkCancelled();
      const frame = document.createElement("canvas"); frame.width = width; frame.height = height;
      const ctx = frame.getContext("2d"); if (!ctx) throw new Error("无法创建画面。");
      const target = new media.BufferTarget();
      const output = new media.Output({ format: format === "mp4" ? new media.Mp4OutputFormat() : new media.WebMOutputFormat(), target });
      const task = await media.Conversion.init({
        input: mediaInput, output, tracks: "primary", showWarnings: false,
        video: { codec, width, height, fit: "fill", frameRate: 30, bitrate: Math.round(Math.max(500000, width * height * (0.7 + quality / 25))), forceTranscode: true,
          process: (sample) => { checkCancelled(); sample.draw(ctx, 0, 0, width, height); drawWatermark(ctx, width, height, settings, logo); return frame; } },
        audio: keepAudio && audioTrack ? { codec: audioCodec, bitrate: 128000, sampleRate: 48000, numberOfChannels: 2, forceTranscode: true } : { discard: true },
      });
      conversion.current = task; checkCancelled();
      if (!task.isValid || task.discardedTracks.some((v) => v.track.type === "video" || (keepAudio && audioTrack && v.track.type === "audio"))) throw new Error("视频或音轨无法转换，请尝试其他格式。");
      task.onProgress = (value) => { lastProgress = performance.now(); if (current === job.current && !cancelled.current) { setProgress(Math.min(99, Math.round(value * 100))); setMessage("正在写入水印…"); } };
      await task.execute(); checkCancelled();
      if (!target.buffer?.byteLength) throw new Error("没有生成视频，请重试。");
      const blob = new Blob([target.buffer], { type: format === "mp4" ? "video/mp4" : "video/webm" });
      const url = URL.createObjectURL(blob); resultRef.current = url;
      setResult({ url, size: blob.size, name: file.name.replace(/\.[^.]+$/, "") + `-水印.${format}` }); setProgress(100); setMessage("水印添加完成");
    } catch (e) { if (current === job.current) setMessage(cancelled.current ? (timedOut ? "处理超时，请换用WebM格式或缩短视频后重试。" : "已取消处理") : e instanceof Error ? e.message : "视频处理失败，请重试。"); }
    finally {
      clearInterval(timer); await conversion.current?.cancel().catch(() => {}); conversion.current = null; input?.dispose(); converting.current = false;
      if (current === job.current) setBusy(false);
    }
  }
  return <UtilityShell title="视频加水印工具" description="为视频添加文字或图片水印，调整位置、大小和透明度。">
    <FileDropZone className="video-file-picker" accept="video/*,.mkv,.mov" disabled={busy} onFile={selectVideo}><FiUploadCloud /><strong>{file ? "重新选择视频" : "选择视频 / 拖入文件"}</strong><span>{file ? file.name : "支持MP4、WebM、MOV等，最大300 MB"}</span></FileDropZone>
    <div className="utility-columns">
      <div className="utility-panel utility-controls"><h2>水印预览</h2>{source ? <div className="watermark-preview" style={{ aspectRatio: dimensions.width ? `${dimensions.width}/${dimensions.height}` : "16/9" }}><video key={source} src={source} controls playsInline onLoadedMetadata={(e) => { const video = e.currentTarget; setDimensions({ width: video.videoWidth, height: video.videoHeight }); }} onError={() => { setDimensions({ width: 0, height: 0 }); setMessage("浏览器无法播放这个视频，请更换文件。"); }} /><canvas ref={canvas} /></div> : <div className="utility-empty">选择视频后在这里预览水印</div>}
        <p className="utility-muted">导出最长边不超过1920像素，最高30帧/秒。</p>
        <h2>处理结果</h2>{result ? <><video className="utility-video" controls playsInline src={result.url} /><a className="primary-button" href={result.url} download={result.name}><FiDownload />下载视频（{(result.size / 1048576).toFixed(1)} MB）</a></> : <div className="utility-empty compact">处理后的视频会显示在这里</div>}
      </div>
      <div className="utility-panel utility-controls"><h2>水印设置</h2><fieldset disabled={busy} className="utility-controls">
        <div className="utility-actions">{(["text", "image"] as const).map((type) => <button key={type} aria-pressed={settings.type === type} onClick={() => change({ type, size: type === "text" ? 5 : 20 })}>{type === "text" ? "文字水印" : "图片水印"}</button>)}</div>
        {settings.type === "text" ? <><label>水印文字<textarea rows={3} maxLength={120} value={settings.text} onChange={(e) => change({ text: e.target.value.split("\n").slice(0, 4).join("\n") })} /></label><label>文字颜色<input type="color" value={settings.color} onChange={(e) => change({ color: e.target.value })} /></label></> : <FileDropZone className="video-file-picker" accept="image/png,image/jpeg,image/webp" disabled={busy} onFile={selectLogo}><FiUploadCloud /><strong>选择水印图片</strong><span>{logoName || "PNG、JPG、WebP，可使用透明Logo"}</span></FileDropZone>}
        <label>大小 {settings.size}%<input type="range" min={1} max={settings.type === "text" ? 20 : 80} value={settings.size} onChange={(e) => change({ size: +e.target.value })} /></label>
        <label>透明度 {settings.opacity}%<input type="range" min={5} max={100} value={settings.opacity} onChange={(e) => change({ opacity: +e.target.value })} /></label>
        <label>快捷位置</label><div className="watermark-positions">{[[5,5,"左上"],[50,5,"上中"],[95,5,"右上"],[5,50,"左中"],[50,50,"居中"],[95,50,"右中"],[5,95,"左下"],[50,95,"下中"],[95,95,"右下"]].map(([x,y,name]) => <button key={name} onClick={() => change({ x: Number(x), y: Number(y) })}>{name}</button>)}</div>
        <label>水平位置 {settings.x}%<input type="range" min={0} max={100} value={settings.x} onChange={(e) => change({ x: +e.target.value })} /></label>
        <label>垂直位置 {settings.y}%<input type="range" min={0} max={100} value={settings.y} onChange={(e) => change({ y: +e.target.value })} /></label>
        <label>输出格式<select value={format} onChange={(e) => { clearResult(); setFormat(e.target.value); }}><option value="mp4">MP4</option><option value="webm">WebM</option></select></label>
        <label>输出画质 {quality}%<input type="range" min={10} max={100} value={quality} onChange={(e) => { clearResult(); setQuality(+e.target.value); }} /></label>
        <label className="utility-checkbox"><input type="checkbox" checked={keepAudio} onChange={(e) => { clearResult(); setKeepAudio(e.target.checked); }} />保留原声音</label>
      </fieldset>
      <button className="primary-button" disabled={busy || !dimensions.width || (settings.type === "image" ? !logo : !settings.text.trim())} onClick={() => void processVideo()}>{busy ? `正在处理 ${progress}%` : "添加水印并导出"}</button>
      {busy && <><progress max={100} value={progress} /><button onClick={() => { cancelled.current = true; setMessage("正在取消…"); void conversion.current?.cancel().catch(() => {}); }}>取消处理</button></>}
      {message && <p role="status">{message}</p>}
      </div>
    </div>
  </UtilityShell>;
}
