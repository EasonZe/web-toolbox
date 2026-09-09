"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { decodeDetailed, encodeDetailed, stats, type CharsetId } from "@morsecodeapp/morse/core";
import { toWavBlob } from "@morsecodeapp/morse/audio";
import { UtilityShell } from "./utility-shell";

const charsets: { value: CharsetId; label: string }[] = [
  { value: "itu", label: "国际摩斯（拉丁字母）" }, { value: "latin-ext", label: "扩展拉丁字母" },
  { value: "cyrillic", label: "西里尔字母" }, { value: "greek", label: "希腊字母" },
  { value: "japanese", label: "日文和文电码" }, { value: "korean", label: "韩文 SKATS" },
];

export default function MorseCodeConverter() {
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [input, setInput] = useState("SOS HELP");
  const [charset, setCharset] = useState<CharsetId>("itu");
  const [wpm, setWpm] = useState(18);
  const [frequency, setFrequency] = useState(650);
  const [volume, setVolume] = useState(80);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [message, setMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");

  const conversion = useMemo(() => {
    if (!input.trim()) return { output: "", errors: [] as string[] };
    if (mode === "encode") {
      const result = encodeDetailed(input, { charset });
      return { output: result.morse, errors: result.errors };
    }
    const result = decodeDetailed(input.replace(/[·•]/g, ".").replace(/[—–]/g, "-"), { charset });
    return { output: result.text, errors: result.errors };
  }, [input, mode, charset]);
  const signalStats = useMemo(() => {
    const morse = mode === "encode" ? conversion.output : input;
    try { return morse.trim() ? stats(morse, wpm) : null; } catch { return null; }
  }, [conversion.output, input, mode, wpm]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  async function play() {
    if (!conversion.output && mode === "encode") return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setProgress(0);
    try {
      const morse = mode === "encode" ? conversion.output : input;
      const blob = toWavBlob(morse, { morse: true, wpm, frequency, volume, waveform: "sine" });
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url; setAudioUrl(url);
      // 使用页面中真实的 audio 元素，避免部分浏览器拦截动态 AudioContext。
      audio.src = url; audio.currentTime = 0; audio.volume = 1; audio.load();
      setPlaying(true); setMessage("正在播放摩斯电码…");
      await audio.play();
    } catch {
      setPlaying(false);
      setProgress(0);
      setMessage("自动播放被浏览器阻止，请使用下方原生播放器的播放键试听。");
    }
  }

  function stop() { const audio = audioRef.current; if (audio) { audio.pause(); audio.currentTime = 0; } setPlaying(false); setProgress(0); setMessage("已停止播放。"); }

  async function copy() {
    try { await navigator.clipboard.writeText(conversion.output); setMessage("转换结果已复制。"); }
    catch { setMessage("复制失败，请手动选择结果复制。"); }
  }

  function switchMode(next: "encode" | "decode") {
    if (next === mode) return;
    stop(); setInput(conversion.output); setMode(next); setMessage("");
  }

  return <UtilityShell title="摩斯电码转换" description="在文字与摩斯电码之间转换，并按标准速度试听电报码。">
    <div className="utility-columns morse-columns">
      <div className="utility-panel utility-controls">
        <div className="mode-tabs" role="tablist" aria-label="转换方向"><button type="button" role="tab" aria-selected={mode === "encode"} onClick={() => switchMode("encode")}>文字 → 摩斯</button><button type="button" role="tab" aria-selected={mode === "decode"} onClick={() => switchMode("decode")}>摩斯 → 文字</button></div>
        <label>字符集<select aria-label="摩斯字符集" value={charset} onChange={(event) => setCharset(event.target.value as CharsetId)}>{charsets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>{mode === "encode" ? "输入文字" : "输入摩斯电码"}<textarea aria-label="摩斯转换输入" rows={8} maxLength={4000} spellCheck={false} value={input} placeholder={mode === "encode" ? "输入需要编码的文字" : "例如：... --- ... / .... . .-.. .--."} onChange={(event) => { setInput(event.target.value); setMessage(""); }} /></label>
        {conversion.errors.length ? <p className="utility-error" role="alert">无法转换：{[...new Set(conversion.errors)].join("、")}</p> : null}
      </div>
      <div className="utility-panel utility-controls">
        <div className="utility-heading"><h2>转换结果</h2><span className="utility-muted">空格分字母，/ 分单词</span></div>
        <textarea className="morse-output" aria-label="摩斯转换结果" rows={8} value={conversion.output} readOnly placeholder="转换结果会显示在这里" />
        <div className="morse-settings"><label>速度 <output>{wpm} WPM</output><input type="range" min="5" max="40" value={wpm} onChange={(event) => setWpm(Number(event.target.value))} /></label><label>音调 <output>{frequency} Hz</output><input type="range" min="300" max="1000" step="10" value={frequency} onChange={(event) => setFrequency(Number(event.target.value))} /></label><label>音量 <output>{volume}%</output><input type="range" min="10" max="100" step="5" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label></div>
        {signalStats ? <div className="morse-stats"><span><strong>{signalStats.dots}</strong> 点</span><span><strong>{signalStats.dashes}</strong> 划</span><span><strong>{signalStats.characters}</strong> 字符</span><span><strong>{signalStats.durationFormatted}</strong> 预计时长</span></div> : null}
        <div className="morse-playback" aria-live="polite">
          <div className={playing ? "morse-signal is-playing" : "morse-signal"} aria-hidden="true"><i />{playing ? "正在发声" : "等待播放"}</div>
          <div className="morse-progress" role="progressbar" aria-label="播放进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>
          <output>{progress}%</output>
        </div>
        <div className="morse-audio-fallback"><span>原生播放器（按钮无声时请点这里）</span><audio ref={audioRef} className="morse-audio" controls preload="none" onPlay={() => { setPlaying(true); setMessage("正在播放摩斯电码…"); }} onPause={(event) => { if (!event.currentTarget.ended) setPlaying(false); }} onTimeUpdate={(event) => { const audio = event.currentTarget; setProgress(audio.duration ? Math.min(100, Math.round(audio.currentTime / audio.duration * 100)) : 0); }} onEnded={() => { setPlaying(false); setProgress(100); setMessage("播放完成。"); }} /></div>
        <div className="utility-actions"><button type="button" disabled={!conversion.output} onClick={() => void copy()}>复制结果</button>{playing ? <button type="button" onClick={stop}>停止播放</button> : <button type="button" disabled={!(mode === "encode" ? conversion.output : input.trim())} onClick={() => void play()}>播放电码</button>}<button type="button" onClick={() => { setInput(""); setMessage(""); }}>清空</button></div>
        {audioUrl ? <a className="morse-download" href={audioUrl} download="morse-code.wav">下载摩斯音频 WAV</a> : null}
        {message ? <p role="status">{message}</p> : null}
      </div>
    </div>
  </UtilityShell>;
}
