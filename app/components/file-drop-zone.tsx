"use client";

import { useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";

type FileDropZoneProps = {
  accept?: string;
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  disabled?: boolean;
  multiple?: boolean;
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
  onFile,
  onFiles,
}: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  function clearDragging() {
    dragDepth.current = 0;
    setDragging(false);
  }

  function deliverFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    if (onFiles) {
      void onFiles(multiple ? files : files.slice(0, 1));
      return;
    }

    if (onFile) void onFile(files[0]);
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
  );
}
