"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { FileDropZone } from "./file-drop-zone";
import { fileSize } from "../lib/local-files";

export function useLocalTask<T>() {
  const [result, setResult] = useState<T | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [status, setStatus] = useState(""),
    [progress, setProgress] = useState(0);
  const job = useRef<AbortController | null>(null);
  const reset = useCallback(() => {
    job.current?.abort();
    job.current = null;
    setResult(null);
    setBusy(false);
    setError("");
    setStatus("");
    setProgress(0);
  }, []);
  useEffect(
    () => () => {
      job.current?.abort();
      job.current = null;
    },
    [],
  );
  const run = useCallback(
    async (
      work: (
        signal: AbortSignal,
        report: (value: number, text?: string) => void,
      ) => Promise<T>,
    ) => {
      reset();
      const controller = new AbortController();
      job.current = controller;
      setBusy(true);
      setStatus("正在处理…");
      const timer = setTimeout(
        () => controller.abort(new Error("处理超时，请缩小文件后重试。")),
        900000,
      );
      let rejectAbort: (() => void) | undefined;
      const aborted = new Promise<T>((_, reject) => {
        rejectAbort = () =>
          reject(controller.signal.reason ?? new Error("已取消处理。"));
        controller.signal.addEventListener("abort", rejectAbort, {
          once: true,
        });
      });
      try {
        const next = await Promise.race([
          work(controller.signal, (value, text = "正在处理…") => {
            if (job.current === controller) {
              setProgress(Math.min(99, Math.max(0, value)));
              setStatus(text);
            }
          }),
          aborted,
        ]);
        controller.signal.throwIfAborted();
        if (job.current !== controller) return;
        setResult(next);
        setProgress(100);
        setStatus("处理完成。");
        return next;
      } catch (cause) {
        if (job.current === controller) {
          setError(
            cause instanceof Error ? cause.message : "处理失败，请检查文件。",
          );
          setStatus("");
        }
      } finally {
        clearTimeout(timer);
        if (rejectAbort)
          controller.signal.removeEventListener("abort", rejectAbort);
        if (job.current === controller) {
          job.current = null;
          setBusy(false);
        }
      }
    },
    [reset],
  );
  return {
    result,
    busy,
    error,
    status,
    progress,
    run,
    reset,
    setError,
    cancel: () => {
      reset();
      setStatus("已取消处理。");
    },
  };
}
function createBlobResource(blob: Blob | null | undefined) {
  let url = "";
  return {
    snapshot: () => url,
    subscribe: (notify: () => void) => {
      url = blob ? URL.createObjectURL(blob) : "";
      notify();
      return () => {
        if (url) URL.revokeObjectURL(url);
        url = "";
      };
    },
  };
}
export function useBlobUrl(blob: Blob | null | undefined) {
  // Object URLs are external resources. Subscribe on the client only, and
  // release on source change/unmount instead of allocating during render.
  const resource = useMemo(() => createBlobResource(blob), [blob]);
  return useSyncExternalStore(resource.subscribe, resource.snapshot, () => "");
}
export function LocalUpload({
  accept,
  multiple = false,
  disabled = false,
  title = "选择文件 / 拖入文件",
  hint,
  onFiles,
}: {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  title?: string;
  hint: string;
  onFiles: (files: File[]) => void | Promise<void>;
}) {
  return (
    <FileDropZone
      className="video-file-picker workbench-upload"
      ariaLabel={title}
      accept={accept}
      multiple={multiple}
      disabled={disabled}
      onFiles={onFiles}
    >
      <strong>{title}</strong>
      <span>{hint}</span>
    </FileDropZone>
  );
}
export function TaskFeedback({
  task,
}: {
  task: {
    busy: boolean;
    error: string;
    status: string;
    progress: number;
    cancel: () => void;
  };
}) {
  return (
    <div className="workbench-feedback" aria-busy={task.busy}>
      {task.busy && (
        <>
          <progress value={task.progress} max={100} aria-label="处理进度" />
          <button type="button" onClick={task.cancel}>
            取消
          </button>
        </>
      )}
      <p className="utility-muted" role="status">
        {task.status}
      </p>
      {task.error && (
        <p className="utility-error" role="alert">
          {task.error}
        </p>
      )}
    </div>
  );
}
export function LocalDownload({
  blob,
  name,
  title = "下载文件",
}: {
  blob: Blob;
  name: string;
  title?: string;
}) {
  const url = useBlobUrl(blob);
  return (
    <a className="primary-button" href={url || undefined} download={name}>
      {title} · {fileSize(blob.size)}
    </a>
  );
}
