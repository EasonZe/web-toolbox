type SerialBatchOptions<T, R> = {
  items: readonly T[];
  signal: AbortSignal;
  process: (item: T, signal: AbortSignal) => Promise<R>;
  onStart: (item: T) => void;
  onSuccess: (item: T, result: R) => void;
  onError: (item: T, error: unknown) => void;
};

// Keep large native image jobs serial. Cancellation prevents commits and new jobs;
// the currently running native decoder/encoder must finish its own cleanup first.
export async function runSerialBatch<T, R>({
  items, signal, process, onStart, onSuccess, onError,
}: SerialBatchOptions<T, R>) {
  const sources = [...items];
  let succeeded = 0, failed = 0;
  for (const item of sources) {
    signal.throwIfAborted();
    onStart(item);
    signal.throwIfAborted();
    let result: R;
    try {
      result = await process(item, signal);
    } catch (error) {
      signal.throwIfAborted();
      onError(item, error);
      failed++;
      continue;
    }
    signal.throwIfAborted();
    onSuccess(item, result);
    succeeded++;
  }
  signal.throwIfAborted();
  return { succeeded, failed };
}
