"use client";
/* eslint-disable @next/next/no-img-element -- Preview is a local Blob URL. */
import { useState } from "react";
import { UtilityShell } from "./utility-shell";
import {
  LocalUpload,
  LocalDownload,
  TaskFeedback,
  useBlobUrl,
  useLocalTask,
} from "./local-workbench";
import { checkFiles } from "../lib/local-files";
import { loadRaster } from "../lib/local-images";
function displayValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (ArrayBuffer.isView(value))
    return `二进制数据（${value.byteLength} 字节）`;
  if (typeof value === "object")
    return JSON.stringify(value)?.slice(0, 1000) ?? "";
  return String(value).slice(0, 1000);
}
export default function ImageExif() {
  const [file, setFile] = useState<File | null>(null),
    [format, setFormat] = useState<"png" | "jpeg" | "webp">("png"),
    preview = useBlobUrl(file);
  const metadata = useLocalTask<{
      values: Record<string, unknown>;
      warning: string;
    }>(),
    task = useLocalTask<Blob>(),
    busy = metadata.busy || task.busy;
  return (
    <UtilityShell
      title="图片 EXIF 查看与清除"
      description="查看 EXIF、GPS 与图片元数据，导出移除元数据的图片。"
    >
      <LocalUpload
        accept="image/png,image/jpeg,image/webp,image/avif,image/bmp"
        disabled={busy}
        hint="PNG / JPG / WebP / AVIF / BMP · 最大 25 MB · 最多 16 MP"
        onFiles={async (files) => {
          task.reset();
          setFile(null);
          const result = await metadata.run(async (signal) => {
            checkFiles(files, 25 * 1048576, 1);
            const bitmap = await loadRaster(files[0], signal);
            bitmap.close();
            const { default: exifr } = await import("exifr");
            try {
              return {
                values:
                  (await exifr.parse(files[0], {
                    tiff: true,
                    xmp: true,
                    iptc: true,
                    icc: true,
                  })) ?? {},
                warning: "",
              };
            } catch {
              return {
                values: {},
                warning: "此格式的元数据无法读取，但仍可重新编码以清除元数据。",
              };
            }
          });
          if (result) setFile(files[0]);
        }}
      />
      <div className="workbench-two">
        <section className="utility-panel utility-controls">
          <h2>图片预览</h2>
          {preview ? (
            <img className="workbench-image" src={preview} alt="待检查图片" />
          ) : (
            <div className="utility-empty">选择图片后查看元数据</div>
          )}
          <label>
            导出格式
            <select
              value={format}
              disabled={busy}
              onChange={(e) => {
                setFormat(e.target.value as typeof format);
                task.reset();
              }}
            >
              <option value="png">PNG（无损重编码）</option>
              <option value="jpeg">JPG（重新编码）</option>
              <option value="webp">WebP（重新编码）</option>
            </select>
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!file || busy}
            onClick={() =>
              void task.run(async (signal) => {
                const bitmap = await loadRaster(file!, signal);
                try {
                  const canvas = document.createElement("canvas");
                  canvas.width = bitmap.width;
                  canvas.height = bitmap.height;
                  const context = canvas.getContext("2d");
                  if (!context) throw new Error("浏览器无法绘制图片。");
                  if (format === "jpeg") {
                    context.fillStyle = "white";
                    context.fillRect(0, 0, canvas.width, canvas.height);
                  }
                  context.drawImage(bitmap, 0, 0);
                  const blob = await new Promise<Blob>((resolve, reject) =>
                    canvas.toBlob(
                      (b) =>
                        b ? resolve(b) : reject(new Error("图片导出失败。")),
                      `image/${format}`,
                      0.95,
                    ),
                  );
                  if (blob.type !== `image/${format}`)
                    throw new Error("浏览器不支持此输出格式，请使用 PNG。");
                  return blob;
                } finally {
                  bitmap.close();
                }
              })
            }
          >
            清除元数据并导出
          </button>
          <p className="utility-muted">
            重新绘制以保留可见方向，移除原文件的 EXIF、GPS、XMP、IPTC
            等数据。JPG/WebP 可能发生画质变化；JPG 透明区域变为白色。
          </p>
        </section>
        <section className="utility-panel">
          <h2>元数据</h2>
          {metadata.result && (
            <>
              {metadata.result.warning && (
                <p className="utility-muted">{metadata.result.warning}</p>
              )}
              {Object.keys(metadata.result.values).length ? (
                <dl className="workbench-details">
                  {Object.entries(metadata.result.values)
                    .slice(0, 300)
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{displayValue(value)}</dd>
                      </div>
                    ))}
                </dl>
              ) : (
                <div className="utility-empty compact">
                  没有发现可读取的元数据
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <TaskFeedback task={metadata} />
      <TaskFeedback task={task} />
      {task.result && (
        <LocalDownload
          blob={task.result}
          name={`clean-image.${format === "jpeg" ? "jpg" : format}`}
          title="下载无元数据图片"
        />
      )}
    </UtilityShell>
  );
}
