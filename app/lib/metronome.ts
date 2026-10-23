export type BeatSettings = { bpm: number; beats: number; subdivision: number; volume: number };
export function validateBeatSettings(settings: BeatSettings) {
  if (!Number.isFinite(settings.bpm) || settings.bpm < 30 || settings.bpm > 300 || !Number.isInteger(settings.beats) || settings.beats < 1 || settings.beats > 12 || ![1, 2, 3, 4].includes(settings.subdivision) || !Number.isFinite(settings.volume) || settings.volume < 0 || settings.volume > 1) throw new Error("请检查速度、拍号和音量设置。");
}
export function tapTempo(taps: number[]) {
  const recent = taps.slice(-6), intervals = recent.slice(1).map((time, index) => time - recent[index]).filter((gap) => gap >= 200 && gap <= 2000);
  return intervals.length ? Math.round(60000 / (intervals.reduce((sum, gap) => sum + gap, 0) / intervals.length)) : null;
}
export function planBeats(next: number, step: number, now: number, settings: BeatSettings) {
  validateBeatSettings(settings);
  // Skip a stalled scheduler's backlog instead of playing missed clicks in a burst.
  if (next < now - 0.05) { next = now + 0.02; step = 0; }
  const events: { time: number; step: number }[] = [];
  while (next < now + 0.12) {
    events.push({ time: next, step });
    next += 60 / settings.bpm / settings.subdivision;
    step = (step + 1) % (settings.beats * settings.subdivision);
  }
  return { next, step, events };
}
export function createMetronome(context: AudioContext, settings: BeatSettings, onBeat: (beat: number) => void, onInterrupted: () => void) {
  validateBeatSettings(settings);
  const master = context.createGain(); master.gain.value = settings.volume; master.connect(context.destination);
  let timer: ReturnType<typeof setInterval> | undefined, closed = false, started = false, next = 0, step = 0;
  const voices = new Set<OscillatorNode>(), visual: { time: number; beat: number }[] = [];
  function dispose() {
    if (closed) return;
    closed = true; clearInterval(timer); context.onstatechange = null;
    for (const voice of voices) { voice.onended = null; try { voice.stop(); } catch { /* Already stopped. */ } voice.disconnect(); }
    voices.clear(); visual.length = 0; master.disconnect(); void context.close().catch(() => {});
  }
  function tick() {
    const planned = planBeats(next, step, context.currentTime, settings); next = planned.next; step = planned.step;
    for (const event of planned.events) {
      const whole = event.step % settings.subdivision === 0, accent = event.step === 0;
      const oscillator = context.createOscillator(), envelope = context.createGain();
      oscillator.frequency.value = accent ? 1200 : whole ? 800 : 500;
      envelope.gain.setValueAtTime(0, event.time);
      envelope.gain.linearRampToValueAtTime(whole ? 0.6 : 0.3, event.time + 0.002);
      envelope.gain.exponentialRampToValueAtTime(0.001, event.time + 0.045);
      oscillator.connect(envelope); envelope.connect(master); voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(event.time); oscillator.stop(event.time + 0.05);
      if (whole) visual.push({ time: event.time, beat: event.step / settings.subdivision });
    }
    while (visual.length && visual[0].time <= context.currentTime) onBeat(visual.shift()!.beat);
  }
  return {
    async start() {
      await context.resume();
      if (closed) return false;
      if (context.state !== "running") throw new Error("声音未启动，请检查浏览器音频权限后重试。");
      started = true; next = context.currentTime + 0.04;
      context.onstatechange = () => { if (started && !closed && context.state !== "running") { dispose(); onInterrupted(); } };
      tick(); timer = setInterval(tick, 25); return true;
    },
    setVolume(volume: number) { if (!closed) master.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), context.currentTime); },
    dispose,
  };
}
