"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FiMaximize, FiPause, FiPlay, FiRotateCcw } from "react-icons/fi";
import { UtilityShell } from "./utility-shell";
import { durationToMilliseconds, formatCountdown, splitCountdown } from "../lib/countdown";

type TimerState = "idle" | "running" | "paused" | "done";

function targetInputValue(offsetMinutes = 60) {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function playFinishedTone(context: AudioContext | null) {
  if (!context) return;
  void context.resume();
  const now = context.currentTime;
  [0, .32, .64].forEach((delay) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(.28, now + delay + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, now + delay + .24);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(now + delay); oscillator.stop(now + delay + .26);
  });
}

export default function CountdownTimer() {
  const [mode, setMode] = useState<"duration" | "target">("duration");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const [target, setTarget] = useState("");
  const [minimumTarget, setMinimumTarget] = useState("");
  const [state, setState] = useState<TimerState>("idle");
  const [remaining, setRemaining] = useState(5 * 60_000);
  const [initial, setInitial] = useState(5 * 60_000);
  const [sound, setSound] = useState(true);
  const [error, setError] = useState("");
  const endAt = useRef(0);
  const audioContext = useRef<AudioContext | null>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializer = window.setTimeout(() => { setTarget(targetInputValue()); setMinimumTarget(targetInputValue(1)); }, 0);
    return () => window.clearTimeout(initializer);
  }, []);
  useEffect(() => () => { void audioContext.current?.close(); }, []);
  useEffect(() => {
    if (state !== "running") return;
    const tick = () => {
      const next = Math.max(0, endAt.current - Date.now());
      setRemaining(next);
      if (next <= 0) {
        setState("done");
        if (sound) playFinishedTone(audioContext.current);
      }
    };
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [state, sound]);

  const parts = useMemo(() => splitCountdown(remaining), [remaining]);
  const progress = initial ? Math.max(0, Math.min(100, remaining / initial * 100)) : 0;

  function configuredDuration() {
    if (mode === "duration") return durationToMilliseconds(hours, minutes, seconds);
    const timestamp = new Date(target).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) throw new Error("目标时间必须晚于现在");
    return timestamp - Date.now();
  }

  function start() {
    try {
      const duration = configuredDuration();
      if (sound && !audioContext.current) audioContext.current = new AudioContext();
      if (sound) void audioContext.current?.resume();
      setInitial(duration); setRemaining(duration); endAt.current = Date.now() + duration;
      setError(""); setState("running");
    } catch (cause) { setError(cause instanceof Error ? `${cause.message}。` : "无法开始倒计时。"); }
  }

  function pause() { setRemaining(Math.max(0, endAt.current - Date.now())); setState("paused"); }
  function resume() { endAt.current = Date.now() + remaining; void audioContext.current?.resume(); setState("running"); }
  function reset() {
    setState("idle"); setError("");
    try { const duration = configuredDuration(); setRemaining(duration); setInitial(duration); } catch { setRemaining(0); setInitial(0); }
  }
  function applyPreset(totalSeconds: number) {
    setMode("duration"); setHours(Math.floor(totalSeconds / 3600)); setMinutes(Math.floor(totalSeconds % 3600 / 60)); setSeconds(totalSeconds % 60);
    setRemaining(totalSeconds * 1000); setInitial(totalSeconds * 1000); setState("idle"); setError("");
  }
  function useDurationMode() {
    const duration = durationToMilliseconds(hours, minutes, seconds);
    setMode("duration"); setState("idle"); setError("");
    setRemaining(duration); setInitial(duration);
  }
  async function enterFullscreen() { await fullscreenRef.current?.requestFullscreen(); }

  return <UtilityShell title="倒计时器" description="按时长或目标时间倒计时，支持暂停、继续、提示音与全屏显示。">
    <div className="countdown-layout">
      <section ref={fullscreenRef} className={`utility-panel countdown-display${state === "done" ? " is-done" : ""}`} aria-live="polite">
        <span>{state === "done" ? "时间到" : state === "running" ? "倒计时进行中" : state === "paused" ? "已暂停" : "准备开始"}</span>
        <strong>{formatCountdown(remaining)}</strong>
        <div className="countdown-units"><span>{parts.days}<small>天</small></span><span>{parts.hours}<small>时</small></span><span>{parts.minutes}<small>分</small></span><span>{parts.seconds}<small>秒</small></span></div>
        <div className="countdown-progress" role="progressbar" aria-label="剩余时间" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${progress}%` }} /></div>
        <button type="button" onClick={() => void enterFullscreen()}><FiMaximize aria-hidden="true" />全屏显示</button>
      </section>
      <section className="utility-panel utility-controls">
        <div className="mode-tabs" role="tablist" aria-label="倒计时设置方式"><button type="button" role="tab" aria-selected={mode === "duration"} onClick={useDurationMode}>按时长</button><button type="button" role="tab" aria-selected={mode === "target"} onClick={() => { setMode("target"); setState("idle"); setError(""); }}>到指定时间</button></div>
        {mode === "duration" ? <>
          <div className="countdown-inputs"><label>小时<input type="number" min="0" max="720" value={hours} disabled={state === "running" || state === "paused"} onChange={(event) => setHours(+event.target.value)} /></label><label>分钟<input type="number" min="0" max="59" value={minutes} disabled={state === "running" || state === "paused"} onChange={(event) => setMinutes(+event.target.value)} /></label><label>秒<input type="number" min="0" max="59" value={seconds} disabled={state === "running" || state === "paused"} onChange={(event) => setSeconds(+event.target.value)} /></label></div>
          <div className="countdown-presets">{[[60,"1分钟"],[300,"5分钟"],[600,"10分钟"],[1500,"25分钟"],[3600,"1小时"]] .map(([value,label]) => <button type="button" disabled={state === "running" || state === "paused"} onClick={() => applyPreset(value as number)} key={label}>{label}</button>)}</div>
        </> : <label>目标日期和时间<input type="datetime-local" value={target} min={minimumTarget || undefined} disabled={state === "running" || state === "paused"} onChange={(event) => setTarget(event.target.value)} /></label>}
        <label className="utility-checkbox"><input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)} />结束时播放提示音</label>
        <div className="countdown-actions">{state === "running" ? <button className="primary-button" type="button" onClick={pause}><FiPause />暂停</button> : state === "paused" ? <button className="primary-button" type="button" onClick={resume}><FiPlay />继续</button> : <button className="primary-button" type="button" onClick={start}><FiPlay />{state === "done" ? "重新开始" : "开始倒计时"}</button>}<button type="button" onClick={reset}><FiRotateCcw />重置</button></div>
        {error ? <p className="utility-error" role="alert">{error}</p> : null}
      </section>
    </div>
  </UtilityShell>;
}
