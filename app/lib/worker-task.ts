type WorkerTaskOptions = {
  timeoutMs?: number;
  timeoutMessage?: string;
  loadMessage: string;
  messageError?: string;
  cancelMessage: string;
  abortError?: () => unknown;
  progress?: "field" | "tagged";
  report?: (value: number, status: string) => void;
  transfer?: () => Transferable[];
  mapMessage?: (data: Record<string, unknown>) => Record<string, unknown>;
};

/** One request, one worker owner. Keep worker factories in clients for Vite's static discovery. */
export function runWorkerTask<T>(createWorker: () => Worker, request: unknown, signal: AbortSignal, options: WorkerTaskOptions): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    let settled = false, timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return false;
      settled = true;
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      signal.removeEventListener("abort", abort);
      if (timer !== undefined) clearTimeout(timer);
      worker.terminate();
      return true;
    };
    const fail = (error: unknown) => { if (finish()) reject(error); };
    const abort = () => fail(options.abortError ? options.abortError() : signal.reason ?? new Error(options.cancelMessage));
    if (options.timeoutMs !== undefined) timer = setTimeout(() => fail(new Error(options.timeoutMessage ?? "处理超时，请重试。")), options.timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data: raw }: MessageEvent<unknown>) => {
      if (settled) return;
      try {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("处理引擎返回了无效消息，请重试。");
        const data = options.mapMessage ? options.mapMessage(raw as Record<string, unknown>) : raw as Record<string, unknown>;
        const hasProgress = Object.hasOwn(data, "progress"), hasError = Object.hasOwn(data, "error"), hasResult = Object.hasOwn(data, "result");
        if ((Number(hasProgress) + Number(hasError) + Number(hasResult)) !== 1 || options.progress === "tagged" && data.type === "progress" && !hasProgress) throw new Error("处理引擎返回了无效消息，请重试。");
        if (hasProgress) {
          if (!options.progress || options.progress === "tagged" && data.type !== "progress" || typeof data.progress !== "number" || !Number.isFinite(data.progress) || data.status !== undefined && typeof data.status !== "string") throw new Error("处理进度消息无效，请重试。");
          options.report?.(Math.max(0, Math.min(100, data.progress)), data.status as string | undefined ?? "正在处理…");
          return;
        }
        if (hasError) {
          if (typeof data.error !== "string" || !data.error) throw new Error("处理引擎返回了无效错误消息，请重试。");
          throw new Error(data.error);
        }
        // Read before settling so even a failing adapter/getter cannot leave the promise pending.
        const result = data.result as T;
        if (finish()) resolve(result);
      } catch (error) { fail(error); }
    };
    worker.onerror = (event) => { event?.preventDefault?.(); fail(new Error(options.loadMessage)); };
    worker.onmessageerror = () => fail(new Error(options.messageError ?? "无法读取处理结果消息，请刷新后重试。"));
    try {
      signal.throwIfAborted();
      const transfer = options.transfer?.() ?? [];
      signal.throwIfAborted();
      worker.postMessage(request, transfer);
    } catch (error) { fail(error); }
  });
}
