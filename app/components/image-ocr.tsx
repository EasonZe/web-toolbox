"use client";
/* eslint-disable @next/next/no-img-element -- Local raster preview uses a revocable Blob URL. */
import { useState } from "react";
import { UtilityShell } from "./utility-shell";
import {
  LocalUpload,
  TaskFeedback,
  useBlobUrl,
  useLocalTask,
} from "./local-workbench";
import { checkFiles, downloadLocal } from "../lib/local-files";
import { rasterPixels, pixelsToPng } from "../lib/local-images";
import { recognizeImage } from "../lib/ocr-client";
export default function ImageOcr() {
  const [file, setFile] = useState<File | null>(null),
    [language, setLanguage] = useState<"eng" | "chi_sim" | "chi_sim+eng">(
      "chi_sim+eng",
    ),
    [text, setText] = useState(""),
    [copyStatus, setCopyStatus] = useState("");
  const task = useLocalTask<{ text: string; confidence: number }>(),
    preview = useBlobUrl(file);
  return (
    <UtilityShell
      title="图片文字识别 OCR"
      description="本地识别中英文图片文字，支持复制、编辑和导出 TXT。"
    >
      <LocalUpload
        accept="image/png,image/jpeg,image/webp,image/bmp"
        disabled={task.busy}
        hint="PNG / JPG / WebP / BMP · 最大 15 MB · 最多 12 MP"
        onFiles={(files) => {
          task.reset();
          setText("");
          setFile(null);
          try {
            checkFiles(files, 15 * 1048576, 1);
            setFile(files[0]);
          } catch (cause) {
            task.setError((cause as Error).message);
          }
        }}
      />
      <div className="workbench-two">
        <section className="utility-panel utility-controls">
          <h2>图片预览</h2>
          {preview ? (
            <img className="workbench-image" src={preview} alt="待识别图片" />
          ) : (
            <div className="utility-empty">选择图片后可预览</div>
          )}
          <label>
            识别语言
            <select
              value={language}
              disabled={task.busy}
              onChange={(e) => {
                setLanguage(e.target.value as typeof language);
                task.reset();
                setText("");
              }}
            >
              <option value="chi_sim+eng">简体中文 + 英文</option>
              <option value="chi_sim">简体中文</option>
              <option value="eng">英文</option>
            </select>
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!file || task.busy}
            onClick={async () => {
              const result = await task.run(async (signal, report) => {
                const image = await rasterPixels(file!, signal);
                if (image.width * image.height > 12_000_000)
                  throw new Error("OCR 图片最多 12 MP，请先裁剪或缩小图片。");
                // Composite transparent pixels over white before OCR.
                for (let i = 0; i < image.data.length; i += 4) {
                  const alpha = image.data[i + 3] / 255;
                  for (let c = 0; c < 3; c++)
                    image.data[i + c] =
                      image.data[i + c] * alpha + 255 * (1 - alpha);
                  image.data[i + 3] = 255;
                }
                const blob = await pixelsToPng(
                  image.data,
                  image.width,
                  image.height,
                );
                return recognizeImage(blob, language, signal, report);
              });
              if (result) setText(result.text);
            }}
          >
            开始识别
          </button>
          <p className="utility-muted">
            首次使用会加载站点内的引擎和语言模型。图片不会上传，识别可能有误，请核对重要文字。
          </p>
        </section>
        <section className="utility-panel utility-controls">
          <h2>识别文字</h2>
          <textarea
            aria-label="OCR 识别文字"
            rows={20}
            value={text}
            disabled={task.busy}
            onChange={(e) => setText(e.target.value)}
          />
          {task.result && (
            <p className="utility-muted">
              平均置信度 {task.result.confidence.toFixed(1)}%
              {!task.result.text.trim()
                ? " · 未识别到文字，请换用更清晰的图片。"
                : ""}
            </p>
          )}
          <div className="utility-actions">
            <button
              type="button"
              disabled={!text}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopyStatus("已复制。");
                } catch {
                  setCopyStatus("无法访问剪贴板，请手动复制。");
                }
              }}
            >
              复制文字
            </button>
            <button
              type="button"
              disabled={!text}
              onClick={() =>
                downloadLocal(
                  new Blob([text], { type: "text/plain;charset=utf-8" }),
                  "ocr-text.txt",
                )
              }
            >
              导出 TXT
            </button>
          </div>
          <p className="utility-muted" role="status">
            {copyStatus}
          </p>
        </section>
      </div>
      <TaskFeedback task={task} />
    </UtilityShell>
  );
}
