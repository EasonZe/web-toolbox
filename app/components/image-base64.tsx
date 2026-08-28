"use client";

/* eslint-disable @next/next/no-img-element -- Local Blob previews must not use the remote image optimizer. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiClipboard, FiCopy, FiDownload, FiImage, FiUploadCloud } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import { base64ToImage, formatImageBase64, imageDownloadName, imageFileToBase64, maxBase64InputChars, supportedImageFormats } from "../lib/image-base64";

type Direction = "encode" | "decode";
type Result = { url: string; textUrl: string; mime: string; width: number; height: number; size: number; base64: string; name: string };
const sizeLabel = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;
const previewLimit = 4000;

export default function ImageBase64() {
  const [direction, setDirection] = useState<Direction>("encode");
  const [format, setFormat] = useState<"data-url" | "raw">("data-url");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const job = useRef<AbortController | null>(null);
  const version = useRef(0);
  const urls = useRef<string[]>([]);
  const encoding = direction === "encode";
  const code = result ? formatImageBase64(result.base64, result.mime, format) : "";

  useEffect(() => () => {
    version.current++; job.current?.abort(); job.current = null;
    urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function clearResult() {
    version.current++; job.current?.abort(); job.current = null;
    urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current = [];
    setResult(null); setBusy(false); setError(""); setMessage("");
  }

  function changeDirection(next: Direction) {
    if (next === direction) return;
    clearResult(); setDirection(next); setInput("");
  }

  function changeInput(value: string) {
    clearResult();
    if (value.length > maxBase64InputChars) { setError("编码过长，最多支持还原10 MB的图片。"); return; }
    setInput(value);
  }

  function changeFormat(next: "data-url" | "raw") {
    if (next === format) return;
    version.current++; setFormat(next); setMessage(""); setError("");
    if (!result) return;
    URL.revokeObjectURL(result.textUrl);
    const textUrl = URL.createObjectURL(new Blob([formatImageBase64(result.base64, result.mime, next)], { type: "text/plain;charset=utf-8" }));
    urls.current = [result.url, textUrl]; setResult({ ...result, textUrl });
  }

  async function convert(file?: File) {
    clearResult();
    const controller = new AbortController(); job.current = controller;
    setBusy(true); setMessage(file ? "正在生成Base64编码…" : "正在还原图片…");
    try {
      const output = file ? await imageFileToBase64(file, controller.signal) : await base64ToImage(input, controller.signal);
      if (job.current !== controller) return;
      const url = URL.createObjectURL(output.blob);
      const textUrl = file ? URL.createObjectURL(new Blob([formatImageBase64(output.base64, output.mime, format)], { type: "text/plain;charset=utf-8" })) : "";
      urls.current = [url, textUrl].filter(Boolean);
      setResult({ ...output, url, textUrl, size: output.blob.size, name: file?.name || imageDownloadName(output.mime) });
      setMessage(file ? "编码生成完成。" : "图片还原完成，可以下载。");
    } catch (cause) {
      if (job.current === controller) { setError(cause instanceof Error ? cause.message : "转换失败，请检查文件或编码。"); setMessage(""); }
    } finally { if (job.current === controller) { job.current = null; setBusy(false); } }
  }

  async function paste() {
    const request = version.current;
    try {
      if (!navigator.clipboard?.readText) throw new Error("unavailable");
      const text = await navigator.clipboard.readText();
      if (request !== version.current) return;
      if (!text.trim()) { setError("剪贴板为空，请复制Base64编码后再粘贴。"); return; }
      changeInput(text);
    } catch { if (request === version.current) setError("无法读取剪贴板，请在输入框内手动粘贴。"); }
  }

  async function copy() {
    if (!result || !encoding) return;
    const request = version.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unavailable");
      await navigator.clipboard.writeText(code);
      if (request === version.current) { setMessage("完整Base64编码已复制。"); setError(""); }
    } catch { if (request === version.current) setError("复制失败，请下载TXT获取完整编码。"); }
  }

  return <main className="tool-shell image-base64-shell">
    <Link className="back-link" href="/">← Eason的工具箱</Link>
    <header className="tool-header image-base64-header">
      <h1>图片与Base64互转工具</h1>
      <p>将图片转换为Base64编码，或将Base64还原为图片。</p>
    </header>
    <section className="converter-card image-base64-card" aria-label="图片与Base64互转">
      <div className="image-base64-options image-base64-directions" aria-label="转换方向">
        <button type="button" aria-pressed={encoding} onClick={() => changeDirection("encode")}>图片 → Base64</button>
        <button type="button" aria-pressed={!encoding} onClick={() => changeDirection("decode")}>Base64 → 图片</button>
      </div>
      {encoding ? <FileDropZone className="video-file-picker" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/x-icon,image/vnd.microsoft.icon,image/avif,.ico"
        ariaLabel="选择或拖入图片" disabled={busy} onFile={(file) => convert(file)}>
        <FiUploadCloud aria-hidden="true" /><strong>{busy ? "正在读取图片…" : result ? "重新选择图片" : "选择图片"}</strong>
        <span>点击选择或拖入图片 · {supportedImageFormats} · 最大10 MB</span>
      </FileDropZone> : <div className="image-base64-input">
        <div className="image-base64-label"><label htmlFor="image-base64-input">Base64编码</label><div><button type="button" disabled={busy} onClick={paste}><FiClipboard aria-hidden="true" />粘贴</button><button type="button" disabled={busy || !input} onClick={() => changeInput("")}>清空</button></div></div>
        <textarea id="image-base64-input" value={input} disabled={busy} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="粘贴 data:image/png;base64,... 或纯Base64编码" onChange={(event) => changeInput(event.target.value)} />
        <p className="image-base64-hint">支持Data URL、纯Base64和换行编码 · 还原图片最大10 MB</p>
        <button type="button" className="convert-button" disabled={busy || !input.trim()} onClick={() => convert()}>{busy ? "正在还原图片…" : "还原图片"}</button>
      </div>}
      {busy && <button type="button" className="image-base64-cancel" onClick={() => { clearResult(); setMessage("已取消转换。"); }}>取消转换</button>}
      <p className="image-base64-status" role="status">{message}</p>
      {error && <p className="image-base64-error" role="alert">{error}</p>}
      <div className="image-base64-workbench">
        <section className="image-base64-panel" aria-label="图片预览">
          <h2>{encoding ? "图片预览" : "还原预览"}</h2>
          {result ? <>
            <div className="image-base64-preview"><img src={result.url} alt={encoding ? "已选择的图片" : "Base64还原后的图片"} /></div>
            <p className="image-base64-name" title={result.name}>{result.name}</p>
            <div className="image-base64-meta"><span>{result.width} × {result.height}</span><span>{sizeLabel(result.size)}</span><span>{result.mime}</span></div>
            {!encoding && <a className="gif-download-button image-base64-download" href={result.url} download={result.name}><FiDownload aria-hidden="true" />下载图片</a>}
          </> : <div className="file-tool-empty image-base64-empty"><FiImage aria-hidden="true" /><strong>{encoding ? "尚未选择图片" : "等待还原图片"}</strong><span>{encoding ? "选择图片后自动生成编码" : "输入Base64并点击“还原图片”"}</span></div>}
        </section>
        <section className="image-base64-panel" aria-label={encoding ? "Base64输出" : "还原说明"}>
          <h2>{encoding ? "Base64输出" : "还原说明"}</h2>
          {encoding ? <>
            <fieldset disabled={busy}><legend>输出格式</legend><div className="image-base64-options"><button type="button" aria-pressed={format === "data-url"} onClick={() => changeFormat("data-url")}>Data URL（含前缀）</button><button type="button" aria-pressed={format === "raw"} onClick={() => changeFormat("raw")}>纯Base64</button></div></fieldset>
            <textarea className="image-base64-output" aria-label="生成的Base64编码" readOnly value={code.slice(0, previewLimit)} placeholder="图片编码会显示在这里" spellCheck={false} />
            <p className="image-base64-hint">{result ? `完整编码共${code.length.toLocaleString()}个字符。${code.length > previewLimit ? "仅预览前4000个字符，复制和下载均为完整内容。" : ""}` : "可直接复制编码，或保存为TXT文件。"}</p>
            <div className="image-base64-actions"><button type="button" className="convert-button" disabled={!result || busy} onClick={copy}><FiCopy aria-hidden="true" />复制完整编码</button>
              {result ? <a className="gif-download-button" href={result.textUrl} download={`${result.name.replace(/\.[^.]+$/, "")}-base64.txt`}><FiDownload aria-hidden="true" />下载TXT</a> : <button type="button" className="convert-button" disabled><FiDownload aria-hidden="true" />下载TXT</button>}</div>
            <p className="image-base64-hint">Data URL可用于图片src或CSS。纯Base64适合需要单独传递图片类型的接口。</p>
          </> : <div className="image-base64-help">
            <p>支持{supportedImageFormats}，保留原始图片格式与透明度，不重新压缩。</p>
            <p>可以粘贴完整Data URL，也可以只粘贴逗号后的Base64编码。换行和空格会自动忽略。</p>
            <p>请勿粘贴图片网址、HTML标签或SVG代码。解码后会检查格式，确认可以预览后才提供下载。</p>
          </div>}
        </section>
      </div>
    </section>
  </main>;
}
