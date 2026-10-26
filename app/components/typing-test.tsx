"use client";
import { useEffect, useRef, useState } from "react";
import { createTypingState, commitTyped, advanceTyping, typingMetrics, typingUnits, typingSamples, type TypingState } from "../lib/typing-test";
import { UtilityShell } from "./utility-shell";
export default function TypingTest() {
  const [duration, setDuration] = useState(60), [reference, setReference] = useState(typingSamples.chinese), [state, setState] = useState(() => createTypingState(typingSamples.chinese)), [draft, setDraft] = useState(""), [now, setNow] = useState(0), [error, setError] = useState(""), [message, setMessage] = useState("");
  const model = useRef(state), composing = useRef(false), generation = useRef(0), compositionGeneration = useRef<number | null>(null), input = useRef<HTMLTextAreaElement>(null);
  const [currentGeneration, setCurrentGeneration] = useState(0);
  function publish(next: TypingState, clock: number) { model.current = next; setState(next); setNow(clock); }
  function reset(target = model.current.target.join(""), seconds = duration) { generation.current++; setCurrentGeneration(generation.current); composing.current = false; compositionGeneration.current = null; try { const next = createTypingState(target, seconds); publish(next, 0); setDraft(""); setError(""); setMessage(""); } catch (cause) { publish({ ...model.current, phase: "finished", finishedAt: model.current.startedAt }, now); setError((cause as Error).message); } }
  function commit(value: string) {
    if (currentGeneration !== generation.current || error) return;
    try { const clock = performance.now(), next = commitTyped(model.current, value, clock); publish(next, clock); setDraft(next.typed); } catch (cause) { setMessage((cause as Error).message); setDraft(model.current.typed); }
  }
  useEffect(() => {
    if (state.phase !== "running") return;
    const timer = setInterval(() => { const clock = performance.now(), next = advanceTyping(model.current, clock); model.current = next; setState(next); setNow(clock); }, 100);
    return () => clearInterval(timer);
  }, [state.phase]);
  const metrics = typingMetrics(state, now), typed = typingUnits(state.typed), start = Math.max(0, typed.length - 100), visible = state.target.slice(start, start + 300);
  return <UtilityShell className="additional-utilities" title="打字速度测试" description="中英文与自定义文本练习，逐位显示差异，统计准确率、正确字符 / 分与 WPM；只记录本次测试。">
    <div className="utility-panel utility-controls"><div className="utility-actions"><button type="button" onClick={() => { setReference(typingSamples.chinese); reset(typingSamples.chinese); }}>中文示例</button><button type="button" onClick={() => { setReference(typingSamples.english); reset(typingSamples.english); }}>英文示例</button><button type="button" onClick={() => reset()}>重新开始</button></div>
      <label>测试时长<select value={duration} onChange={(e) => { const seconds = Number(e.target.value); setDuration(seconds); reset(model.current.target.join(""), seconds); }}><option value="30">30 秒</option><option value="60">60 秒</option><option value="120">120 秒</option></select></label>
      <details><summary>自定义参考文本（最多 5000 个字素）</summary><label>参考文本<textarea rows={5} value={reference} maxLength={20000} onChange={(e) => setReference(e.target.value)} /></label><button type="button" onClick={() => reset(reference)}>应用参考文本</button></details>
      {error && <p className="utility-error" role="alert">{error}</p>}
      <div className="typing-metrics"><div><span>剩余时间</span><strong>{metrics.remaining.toFixed(1)}s</strong></div><div><span>准确率（当前文本）</span><strong>{metrics.accuracy.toFixed(1)}%</strong></div><div><span>正确字符 / 分</span><strong>{metrics.cpm.toFixed(1)}</strong></div><div><span>WPM（5 字符 = 1 词）</span><strong>{metrics.wpm.toFixed(1)}</strong></div></div>
      <p className="utility-muted">{state.phase === "idle" ? "首次提交有效输入时开始计时；中文输入法在确认候选后计入。" : state.phase === "running" ? "正在测试；切换标签页后计时仍继续。" : "本次测试结束。"}正确 {metrics.correct} · 错误 / 超出 {metrics.wrong} · 已输入 {metrics.typed}</p>
      <div className="typing-target" role="region" aria-label="参考文本局部对照"><span className="visually-hidden">当前显示第 {start + 1} 至 {start + visible.length} 个字素，已输入 {typed.length} 个。</span>{visible.map((unit, index) => <span key={start + index} className={start + index < typed.length ? unit === typed[start + index] ? "is-correct" : "is-wrong" : start + index === typed.length ? "is-caret" : undefined}>{unit === "\n" ? "↵\n" : unit}</span>)}</div>
      <label>在此输入<textarea ref={input} key={currentGeneration} value={draft} maxLength={20000} rows={5} readOnly={state.phase === "finished" || !!error} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => { if (currentGeneration !== generation.current) return; if (composing.current || (e.nativeEvent as InputEvent).isComposing) setDraft(e.target.value); else commit(e.target.value); }} onCompositionStart={() => { if (currentGeneration !== generation.current) return; composing.current = true; compositionGeneration.current = generation.current; }} onCompositionEnd={(e) => { if (currentGeneration !== generation.current) return; composing.current = false; if (compositionGeneration.current !== generation.current) return; compositionGeneration.current = null; commit(e.currentTarget.value); }} onPaste={(e) => { e.preventDefault(); setMessage("自测请手动输入，不使用粘贴。"); }} onDrop={(e) => { e.preventDefault(); setMessage("自测请手动输入，不使用拖放。"); }} onBeforeInput={(e) => { if (/insertFrom(Paste|Drop)/.test((e.nativeEvent as InputEvent).inputType ?? "")) { e.preventDefault(); setMessage("请手动输入。"); } }} /></label>
      <p className="utility-muted" role="status">{message}</p>
      <p className="utility-muted">到时或输入达到参考篇幅长度即结束；不要求全部正确。字素按 Unicode 分段并做 NFC 规范化，换行也计一个；退格能修正准确率，统计不是总击键错误率。WPM 使用 5 个正确字符为一词的约定，中文建议看字符 / 分。尽量阻止粘贴，但不提供防脚本、防输入法预测或考试认证；不监听页面外键盘，不保存成绩。</p>
    </div>
  </UtilityShell>;
}
