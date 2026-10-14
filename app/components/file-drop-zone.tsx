"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { largeFilesWarning, checkImagePixels, toolLimits } from "../lib/resource-limits";

type FileDropZoneProps = {
  accept?: string;
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  disabled?: boolean;
  multiple?: boolean;
  resourceMode?: "memory" | "stream";
  onFile?: (file: File) => void | Promise<void>;
  onFiles?: (files: File[]) => void | Promise<void>;
};

export function FileDropZone({
  accept,
  ariaLabel,
  children,
  className,
  disabled = false,
  multiple = false,
  resourceMode = "memory",
  onFile,
  onFiles,
}: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<File[] | null>(null);
  const [error, setError] = useState("");
  const deliveryJob = useRef(0);
  useEffect(() => () => { deliveryJob.current++; }, []);
  const dragDepth = useRef(0);

  function clearDragging() {
    dragDepth.current = 0;
    setDragging(false);
  }

  function deliverFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).slice(0, multiple ? undefined : 1);
    if (files.length === 0) return;
    deliveryJob.current++; setPending(null); setError("");
    if (largeFilesWarning(files, resourceMode === "stream")) { setPending(files); return; }
    processFiles(files);
  }
  async function processFiles(files: File[]) {
    if (disabled) return;
    const generation = ++deliveryJob.current;
    setPending(null);
    setError("");
    try {
      for (const file of files) {
        if (resourceMode !== "stream" && /^image\/(png|jpeg|webp|bmp)$/.test(file.type) && typeof file.slice === "function") {
          const { inspectRasterHeader } = await import("../lib/local-images");
          const dimensions = inspectRasterHeader(new Uint8Array(await file.slice(0, 65536).arrayBuffer()), toolLimits.image.pixels);
          if (generation !== deliveryJob.current) return;
          if (dimensions.width && dimensions.height) checkImagePixels(dimensions.width, dimensions.height);
        }
      }
      if (generation !== deliveryJob.current) return;
    if (onFiles) {
      await onFiles(multiple ? files : files.slice(0, 1));
      return;
    }

    if (onFile) await onFile(files[0]);
    } catch (cause) {
      if (generation === deliveryJob.current) setError(cause instanceof Error ? cause.message : "文件读取失败，请重试。");
    }
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    clearDragging();
    if (disabled) return;

    deliverFiles(event.dataTransfer.files);
  }

  return (
    <>
    <label
      className={`${className}${dragging ? " is-dragging" : ""}`}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        multiple={multiple}
        onChange={(event) => {
          deliverFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      {children}
    </label>
    {pending && <div className="resource-warning" role="alert">
      <p>{largeFilesWarning(pending)}</p>
      <div className="utility-actions">
        <button type="button" disabled={disabled} onClick={() => processFiles(pending)}>继续导入</button>
        <button type="button" onClick={() => { deliveryJob.current++; setPending(null); }}>取消</button>
      </div>
    </div>}
    {error && <p className="utility-error" role="alert">{error}</p>}
    </>
  );
}
