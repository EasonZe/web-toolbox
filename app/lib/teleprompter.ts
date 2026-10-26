export function promptPosition(position: number, elapsed: number, speed: number, maximum: number) {
  if (![position, elapsed, speed, maximum].every(Number.isFinite) || position < 0 || elapsed < 0 || speed < 5 || speed > 200 || maximum < 0) throw new Error("提词器滚动参数无效。");
  return Math.min(maximum, position + Math.min(elapsed, 100) / 1000 * speed);
}
export function startPromptScroll(options: { read: () => { position: number; maximum: number }; write: (position: number) => void; speed: number; end: () => void; schedule?: (work: FrameRequestCallback) => number; cancel?: (id: number) => void; now?: () => number }) {
  const schedule = options.schedule ?? requestAnimationFrame, cancel = options.cancel ?? cancelAnimationFrame;
  let previous = (options.now ?? (() => performance.now()))(), stopped = false, id = 0;
  const tick: FrameRequestCallback = (now) => {
    if (stopped) return;
    const { position, maximum } = options.read(), next = promptPosition(position, Math.max(0, now - previous), options.speed, maximum); previous = now; options.write(next);
    if (next >= maximum) { stopped = true; options.end(); } else id = schedule(tick);
  };
  id = schedule(tick);
  return () => { if (!stopped) { stopped = true; cancel(id); } };
}
