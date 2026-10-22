/** Coalesce synchronous storage writes without losing pending edits on navigation. */
export function createDraftAutosave(write: (value: string) => void, delay = 400) {
  let pending: string | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  function cancel() { clearTimeout(timer); timer = undefined; pending = null; }
  function flush() {
    const value = pending;
    cancel();
    if (value !== null) write(value);
  }
  return {
    schedule(value: string) { pending = value; clearTimeout(timer); timer = setTimeout(flush, delay); },
    flush,
    cancel,
  };
}
