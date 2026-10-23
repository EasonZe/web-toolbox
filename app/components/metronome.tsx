"use client";
import { useEffect, useRef, useState } from "react";
import { createMetronome, tapTempo, validateBeatSettings } from "../lib/metronome";
import { UtilityShell } from "./utility-shell";

export default function Metronome() {
  const [bpm, setBpm] = useState(100), [beats, setBeats] = useState(4), [subdivision, setSubdivision] = useState(1), [volume, setVolume] = useState(0.5);
  const [running, setRunning] = useState(false), [starting, setStarting] = useState(false), [beat, setBeat] = useState(-1), [message, setMessage] = useState("");
  const engine = useRef<ReturnType<typeof createMetronome> | null>(null), taps = useRef<number[]>([]);
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);
  function stop() { engine.current?.dispose(); engine.current = null; setRunning(false); setStarting(false); setBeat(-1); }
  async function start() {
    stop(); setMessage(""); setStarting(true);
    let next: ReturnType<typeof createMetronome> | null = null;
    try {
      validateBeatSettings({ bpm, beats, subdivision, volume });
      const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) throw new Error("当前浏览器不支持 Web Audio。");
      next = createMetronome(new Audio(), { bpm, beats, subdivision, volume }, setBeat, () => { stop(); setMessage("音频已被系统暂停，请点击开始继续。"); });
      engine.current = next;
      if (await next.start() && engine.current === next) { setRunning(true); setStarting(false); }
    } catch (cause) {
      if (next && engine.current !== next) return;
      stop(); setMessage(cause instanceof Error ? cause.message : "无法启动声音。");
    }
  }
  function tap() {
    const now = performance.now();
    taps.current = now - (taps.current.at(-1) ?? 0) > 2000 ? [now] : [...taps.current.slice(-5), now];
    const tempo = tapTempo(taps.current); if (tempo) { stop(); setBpm(tempo); }
    setMessage(tempo ? `敲击测速：${tempo} BPM` : "继续按相同节奏敲击。");
  }
  return <UtilityShell className="additional-utilities" title="节拍器" description="练习节奏与速度，支持重拍、细分节奏和敲击测速。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>节奏设置</h2>
      <label className="utility-range-control"><span>速度<output>{bpm} BPM</output></span><input type="range" min="30" max="300" value={bpm} onChange={(e) => { stop(); setBpm(Number(e.target.value)); }} /></label>
      <label>精确速度<input type="number" min="30" max="300" value={bpm} onChange={(e) => { stop(); setBpm(Number(e.target.value)); }} /></label>
      <label>每小节拍数<select value={beats} onChange={(e) => { stop(); setBeats(Number(e.target.value)); }}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} 拍</option>)}</select></label>
      <label>每拍细分<select value={subdivision} onChange={(e) => { stop(); setSubdivision(Number(e.target.value)); }}><option value="1">四分音符</option><option value="2">八分音符</option><option value="3">三连音</option><option value="4">十六分音符</option></select></label>
      <label className="utility-range-control"><span>音量<output>{Math.round(volume * 100)}%</output></span><input type="range" min="0" max="100" value={volume * 100} onChange={(e) => { const next = Number(e.target.value) / 100; setVolume(next); engine.current?.setVolume(next); }} /></label>
      <p className="utility-muted">修改速度、拍数或细分会停止播放，点击开始应用新节奏。音量可以实时调节。</p>
    </section><section className="utility-panel utility-controls"><h2>节拍</h2><div className="metronome-tempo">{bpm || "—"}<small>BPM</small></div>
      <div className="metronome-beats" aria-label={running ? `第 ${beat + 1} 拍` : "未播放"}>{Array.from({ length: beats }, (_, i) => <span key={i} className={i === beat ? "is-active" : ""}>{i + 1}</span>)}</div>
      <button className="primary-button" type="button" onClick={() => running || starting ? stop() : void start()}>{starting ? "取消启动" : running ? "停止" : "开始"}</button>
      <button type="button" onClick={tap}>敲击测速（Tap）</button><p className="utility-muted" role="status">{message}</p><p className="utility-muted">每小节第一拍为高音重拍。手机请开启媒体音量；系统休眠、锁屏或音频中断时可能暂停。</p>
    </section></div>
  </UtilityShell>;
}
