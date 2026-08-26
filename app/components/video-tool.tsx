"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { FiDownload } from "react-icons/fi";
import { buildApiUrl, extractSource } from "../lib/video-links";

export type VideoToolConfig = {
  name: string;
  title: string;
  description: string;
  note: string;
  apiPrefix: string;
  placeholder: string;
  domains: string[];
  downloadName: string;
  canonicalizeBilibili?: boolean;
  canonicalizeYoutube?: boolean;
};

export default function VideoTool({ config }: { config: VideoToolConfig }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(true);
    toastTimer.current = setTimeout(() => setToast(false), 1500);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast();
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      if (copied) showToast();
      else setMessage("浏览器未允许复制，请长按链接手动复制。");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const source = extractSource(value, config);

    if (!value.trim()) {
      setResult("");
      setMessage(`请先粘贴${config.name}分享链接。`);
      return;
    }

    if (!source) {
      setResult("");
      setMessage(`没有找到有效的${config.name}链接。`);
      return;
    }

    setMessage("");
    setDownloadProgress(null);
    setResult(buildApiUrl(config.apiPrefix, source));
  }

  async function downloadVideo() {
    if (!result || downloading) return;

    setDownloading(true);
    setDownloadProgress(null);
    setMessage("");

    try {
      const response = await fetch(result);
      if (!response.ok) {
        throw new Error(`接口返回 HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (
        !contentType.toLowerCase().startsWith("video/") &&
        !contentType.toLowerCase().includes("octet-stream")
      ) {
        const responseText = await response.text();
        let detail = responseText.slice(0, 120);

        try {
          const data = JSON.parse(responseText) as {
            error?: { message?: string };
            message?: string;
          };
          detail = data.error?.message || data.message || detail;
        } catch {
          // Keep the short plain-text response as the error detail.
        }

        throw new Error(detail || "接口没有返回视频文件");
      }

      const totalSize = Number(response.headers.get("content-length")) || 0;
      const reader = response.body?.getReader();
      let videoBlob: Blob;

      if (reader) {
        const chunks: BlobPart[] = [];
        let receivedSize = 0;

        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          if (!chunk) continue;

          chunks.push(chunk);
          receivedSize += chunk.byteLength;

          if (totalSize > 0) {
            setDownloadProgress(
              Math.min(100, Math.round((receivedSize / totalSize) * 100)),
            );
          }
        }

        videoBlob = new Blob(chunks, {
          type: contentType || "video/mp4",
        });
      } else {
        videoBlob = await response.blob();
      }

      if (!videoBlob.size) throw new Error("下载到的视频文件为空");

      const videoUrl = URL.createObjectURL(videoBlob);
      const link = document.createElement("a");
      link.href = videoUrl;
      link.download = config.downloadName;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(videoUrl), 1000);
      setDownloadProgress(100);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `下载失败：${error.message}。可尝试点击“打开视频”后保存。`
          : "下载失败，可尝试点击“打开视频”后保存。",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="tool-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> Eason的工具箱
      </Link>

      <header className="tool-header">
        <h1>{config.title}</h1>
        <p className="video-tool-description">
          <span>{config.description}</span>
          <span>{config.note}</span>
        </p>
      </header>

      <section className="converter-card" aria-label={`${config.name}链接转换工具`}>
        <div className="field">
          <label>API 链接</label>
          <div className="link-row api-row">
            <code>{config.apiPrefix}</code>
            <button
              className="copy-button"
              type="button"
              onClick={() => copyText(config.apiPrefix)}
            >
              复制
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="share-text">{config.name}分享链接</label>
            <textarea
              id="share-text"
              rows={6}
              autoComplete="off"
              spellCheck={false}
              placeholder={config.placeholder}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
          <button className="convert-button" type="submit">
            转换链接
          </button>
        </form>

        {message ? (
          <p className="message" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}

        {result ? (
          <section className="result" aria-labelledby="result-title">
            <label id="result-title">转换结果</label>
            <div className="link-row">
              <code>{result}</code>
              <button
                className="copy-button"
                type="button"
                onClick={() => copyText(result)}
              >
                复制
              </button>
            </div>
            <div className="video-result-actions">
              <a
                className="open-button"
                href={result}
                target="_blank"
                rel="noopener noreferrer"
              >
                打开视频
              </a>
              <button
                className="open-button download-video-button"
                type="button"
                onClick={() => void downloadVideo()}
                disabled={downloading}
              >
                <FiDownload aria-hidden="true" />
                {downloading
                  ? downloadProgress === null
                    ? "正在下载…"
                    : `正在下载 ${downloadProgress}%`
                  : "下载视频"}
              </button>
            </div>
          </section>
        ) : null}
      </section>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          已复制
        </div>
      ) : null}
    </main>
  );
}
