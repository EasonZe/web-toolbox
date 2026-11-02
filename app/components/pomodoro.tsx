"use client";

import { useEffect, useRef, useState } from "react";
import { FiPause, FiPlay, FiRotateCcw, FiSkipForward } from "react-icons/fi";
import { UtilityShell } from "./utility-shell";
import {
  createPomodoro, defaultPomodoroConfig, formatPomodoroTime, pausePomodoro, pomodoroPhaseDuration,
  pomodoroPhaseNames, skipPomodoro, startPomodoro, tickPomodoro, validatePomodoroConfig,
  type PomodoroConfig, type PomodoroState,
} from "../lib/pomodoro";

type Tone = { oscillator: OscillatorNode; gain: GainNode };
type ConfigDraft = Record<keyof PomodoroConfig, string>;
const fields = [
  ["focusMinutes", "专注时长", "分钟", 1440], ["shortBreakMinutes", "短休息", "分钟", 1440],
  ["longBreakMinutes", "长休息", "分钟", 1440], ["rounds", "长休间隔", "轮", 24],
] as const;

function readDraft(draft: ConfigDraft) {
  return validatePomodoroConfig({ focusMinutes: Number(draft.focusMinutes), shortBreakMinutes: Number(draft.shortBreakMinutes), longBreakMinutes: Number(draft.longBreakMinutes), rounds: Number(draft.rounds) });
}

export default function Pomodoro() {
  const [timer, setTimer] = useState(() => createPomodoro());
  const [draft, setDraft] = useState<ConfigDraft>({ focusMinutes: "25", shortBreakMinutes: "5", longBreakMinutes: "15", rounds: "4" });
  const [sound, setSound] = useState(false);
  const [audioWarning, setAudioWarning] = useState("");
  const [message, setMessage] = useState("准备好后，开始第一轮专注。");
  const current = useRef(timer), audio = useRef<AudioContext | null>(null), tones = useRef(new Set<Tone>()), soundEnabled = useRef(false), mounted = useRef(true);
  let configError = "";
  try { readDraft(draft); } catch (cause) { configError = cause instanceof Error ? cause.message : "设置无效。"; }
  const locked = timer.status !== "ready";

  function commit(next: PomodoroState) { current.current = next; setTimer(next); }
  function stopTones() {
    for (const tone of tones.current) {
      tone.oscillator.onended = null;
      try { tone.oscillator.stop(); } catch { /* Already ended. */ }
      tone.oscillator.disconnect(); tone.gain.disconnect();
    }
    tones.current.clear();
  }
  function unavailableAudio() { if (mounted.current) setAudioWarning("提示音暂不可用，计时仍会正常进行。"); }
  function prepareAudio() {
    try {
      if (!audio.current) audio.current = new window.AudioContext();
      void audio.current.resume().catch(unavailableAudio);
      setAudioWarning("");
    } catch { unavailableAudio(); }
  }
  function finishedTone() {
    if (!soundEnabled.current || !audio.current || audio.current.state !== "running") return;
    try {
      stopTones();
      const context = audio.current, now = context.currentTime;
      for (const delay of [0, .3]) {
        const oscillator = context.createOscillator(), gain = context.createGain(), tone = { oscillator, gain };
        tones.current.add(tone); oscillator.frequency.value = 660;
        gain.gain.setValueAtTime(.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(.18, now + delay + .02);
        gain.gain.exponentialRampToValueAtTime(.0001, now + delay + .2);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); tones.current.delete(tone); };
        oscillator.start(now + delay); oscillator.stop(now + delay + .22);
      }
    } catch { stopTones(); unavailableAudio(); }
  }
  function receive(next: PomodoroState) {
    const before = current.current;
    commit(next);
    if (next.finishedPhases > before.finishedPhases) {
      setMessage(`${pomodoroPhaseNames[before.phase]}结束。下一段：${pomodoroPhaseNames[next.phase]}，点击开始继续。`);
      finishedTone();
    }
  }

  useEffect(() => {
    mounted.current = true;
    const nodes = tones.current;
    return () => {
      mounted.current = false;
      for (const tone of nodes) { tone.oscillator.onended = null; try { tone.oscillator.stop(); } catch { /* Already ended. */ } tone.oscillator.disconnect(); tone.gain.disconnect(); }
      nodes.clear();
      if (audio.current) void audio.current.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (timer.status !== "running") return;
    const update = () => receive(tickPomodoro(current.current, Date.now()));
    const interval = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", update); };
  // The ref owns the running deadline; changing a display value must not restart the interval.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.status]);

  function changeSetting(key: keyof PomodoroConfig, value: string) {
    if (current.current.status !== "ready") return;
    const next = { ...draft, [key]: value }; setDraft(next);
    try { commit(createPomodoro(readDraft(next))); setMessage("设置已更新，准备开始新的计划。"); } catch { /* Keep the editable draft and show validation. */ }
    stopTones();
  }
  function start() {
    if (configError || current.current.status === "running") return;
    if (soundEnabled.current) prepareAudio();
    commit(startPomodoro(current.current, Date.now())); setMessage(`${pomodoroPhaseNames[current.current.phase]}进行中。`);
  }
  function pause() { receive(pausePomodoro(current.current, Date.now())); if (current.current.status === "paused") setMessage("已暂停，点击继续恢复计时。"); }
  function skip() {
    const before = current.current, next = skipPomodoro(before, Date.now());
    receive(next); stopTones();
    if (next.skippedPhases > before.skippedPhases) setMessage(`已跳过${pomodoroPhaseNames[before.phase]}，本段不计入完成记录。下一段：${pomodoroPhaseNames[next.phase]}。`);
  }
  function reset() {
    stopTones(); setAudioWarning("");
    try { commit(createPomodoro(readDraft(draft))); setMessage("计划已重置，本页完成记录已清空。"); }
    catch { setDraft({ focusMinutes: String(defaultPomodoroConfig.focusMinutes), shortBreakMinutes: String(defaultPomodoroConfig.shortBreakMinutes), longBreakMinutes: String(defaultPomodoroConfig.longBreakMinutes), rounds: String(defaultPomodoroConfig.rounds) }); commit(createPomodoro()); setMessage("已恢复默认设置。"); }
  }
  const duration = pomodoroPhaseDuration(timer.config, timer.phase);
  const progress = Math.max(0, Math.min(100, (duration - timer.remainingMs) / duration * 100));
  const round = timer.phase === "focus" ? timer.cycleFocus + 1 : Math.max(1, timer.cycleFocus);

  return <UtilityShell title="番茄专注钟" description="专注、短休息与长休息按轮次安排，支持暂停、跳过和提示音。" className="pomodoro-tool">
    <div className="utility-columns pomodoro-layout">
      <section className="utility-panel pomodoro-display" aria-label="专注计时">
        <div className="pomodoro-phase"><strong>{pomodoroPhaseNames[timer.phase]}</strong><span>第 {round} / {timer.config.rounds} 轮</span></div>
        <strong className="pomodoro-time" role="timer" aria-live="off" aria-label={`剩余 ${formatPomodoroTime(timer.remainingMs)}`}>{formatPomodoroTime(timer.remainingMs)}</strong>
        <div className="countdown-progress" role="progressbar" aria-label="本段进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${progress}%` }} /></div>
        <p className="utility-muted pomodoro-status" role="status">{message}</p>
        <div className="utility-actions pomodoro-actions">
          {timer.status === "running" ? <button type="button" className="primary-button" onClick={pause}><FiPause aria-hidden="true" />暂停</button> : <button type="button" className="primary-button" onClick={start} disabled={!!configError}><FiPlay aria-hidden="true" />{timer.status === "paused" ? "继续" : `开始${pomodoroPhaseNames[timer.phase]}`}</button>}
          <button type="button" onClick={skip} disabled={!!configError}><FiSkipForward aria-hidden="true" />跳过本段</button>
          <button type="button" onClick={reset}><FiRotateCcw aria-hidden="true" />重置计划</button>
        </div>
        <dl className="pomodoro-stats"><div><dt>本页已完成</dt><dd>{timer.completedFocus} 轮专注</dd></div><div><dt>累计专注</dt><dd>{Math.round(timer.completedFocusMs / 60_000)} 分钟</dd></div></dl>
      </section>
      <section className="utility-panel utility-controls pomodoro-settings" aria-label="番茄钟设置">
        <h2>轮次设置</h2>
        <div className="pomodoro-inputs">{fields.map(([key, label, unit, max]) => <label key={key}>{label}<span className="pomodoro-input-unit"><input type="number" inputMode="numeric" min="1" max={max} step="1" value={draft[key]} disabled={locked} onChange={(event) => changeSetting(key, event.target.value)} aria-label={label} /><span>{unit}</span></span></label>)}</div>
        <p className="utility-muted">每完成 {timer.config.rounds} 轮专注进入长休息。修改设置会重置计划；计时或暂停时需先重置。</p>
        <label className="utility-checkbox"><input type="checkbox" checked={sound} onChange={(event) => { const value = event.target.checked; setSound(value); soundEnabled.current = value; if (value) prepareAudio(); else { stopTones(); setAudioWarning(""); } }} />阶段结束时播放提示音</label>
        {configError ? <p className="utility-error" role="alert">{configError}</p> : null}
        {audioWarning ? <p className="utility-muted" role="status">{audioWarning}</p> : null}
        <p className="utility-muted">每段结束后手动开始下一段。后台恢复时校正剩余时间，不自动补算多轮。记录仅保留在当前页面；关闭网页、系统休眠或锁屏时，提示音可能无法准时播放。</p>
      </section>
    </div>
  </UtilityShell>;
}
