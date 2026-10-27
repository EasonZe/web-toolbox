"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { easingPresets, inspectEasing, type CurvePoints } from "../lib/easing-curve";
import { UtilityShell } from "./utility-shell";
import { TextUtilityResult } from "./text-utility-parts";

export default function EasingCurve() {
  const [points, setPoints] = useState<CurvePoints>([0.25, 0.1, 0.25, 1]), [duration, setDuration] = useState(1000);
  const [playing, setPlaying] = useState(false), [hasPreview, setHasPreview] = useState(false), [message, setMessage] = useState("");
  const runwayRef = useRef<HTMLDivElement | null>(null), dotRef = useRef<HTMLDivElement | null>(null), animationRef = useRef<Animation | null>(null);
  useEffect(() => () => { const current = animationRef.current; if (current) { current.onfinish = current.oncancel = null; current.cancel(); } animationRef.current = null; }, []);
  const result = useMemo(() => { try { return { value: inspectEasing(points, duration), error: "" }; } catch (cause) { return { value: null, error: (cause as Error).message }; } }, [points, duration]);
  function stop() { const current = animationRef.current; animationRef.current = null; if (current) { current.onfinish = current.oncancel = null; current.cancel(); } setPlaying(false); setHasPreview(false); setMessage(""); }
  function update(index: number, value: number) { stop(); setPoints(points.map((old, i) => i === index ? value : old) as CurvePoints); }
  function play() {
    stop();
    if (!result.value || !runwayRef.current || !dotRef.current) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setMessage("系统已开启减少动态效果；曲线和 CSS 仍可正常查看与导出。"); return; }
    try {
      const distance = Math.max(0, runwayRef.current.clientWidth - 32 - dotRef.current.offsetWidth);
      const animation = dotRef.current.animate([{ transform: "translateX(0)" }, { transform: `translateX(${distance}px)` }], { duration: result.value.duration, easing: result.value.easing, fill: "forwards" });
      animationRef.current = animation; setPlaying(true); setHasPreview(true);
      animation.onfinish = () => { if (animationRef.current === animation) { setPlaying(false); setMessage("预览完成，可再次播放。"); } };
    } catch { setMessage("浏览器无法播放 Web Animations，仍可查看曲线与导出 CSS。"); }
  }
  const curve = result.value;
  return <UtilityShell className="additional-utilities" title="CSS 缓动曲线" description="调节 cubic-bezier 控制点，比较缓动效果，预览位移动画并导出 CSS。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>曲线设置</h2><div className="utility-actions" role="group" aria-label="缓动预设">{easingPresets.map((preset) => <button type="button" key={preset.name} aria-pressed={points.every((v, i) => v === preset.points[i])} onClick={() => { stop(); setPoints([...preset.points]); }}>{preset.name}</button>)}</div>
      {points.map((value, index) => <div className="easing-point-control" key={index}><label>{["x1", "y1", "x2", "y2"][index]}<input type="number" step="0.01" min={index % 2 ? -2 : 0} max={index % 2 ? 3 : 1} value={Number.isFinite(value) ? value : ""} onChange={(e) => update(index, e.target.value === "" ? NaN : Number(e.target.value))} /></label><input aria-label={`${["x1", "y1", "x2", "y2"][index]} 滑块`} type="range" step="0.01" min={index % 2 ? -2 : 0} max={index % 2 ? 3 : 1} value={Number.isFinite(value) ? value : 0} onChange={(e) => update(index, Number(e.target.value))} /></div>)}
      <label>动画时长（毫秒）<input type="number" min="100" max="10000" step="100" value={Number.isFinite(duration) ? duration : ""} onChange={(e) => { stop(); setDuration(e.target.value === "" ? NaN : Number(e.target.value)); }} /></label>
      {result.error && <p className="utility-error" role="alert">{result.error}</p>}
      <p className="utility-muted">x1、x2 范围 0～1；本编辑器 y1、y2 范围 -2～3，可形成回弹。曲线纵轴会自动缩放，图中直线连接两个端点。预览只在点击后播放，尊重系统减少动态效果设置，不修改全站动画。</p>
    </section><section className="utility-panel utility-controls"><h2>曲线与预览</h2>{curve && <><svg className="easing-plot" viewBox="0 0 360 304" role="img" aria-label={`缓动曲线 ${curve.easing}`}><line className="easing-guide" x1={curve.start[0]} y1={curve.start[1]} x2={curve.end[0]} y2={curve.end[1]} /><line className="easing-guide" x1={curve.start[0]} y1={curve.start[1]} x2={curve.first[0]} y2={curve.first[1]} /><line className="easing-guide" x1={curve.end[0]} y1={curve.end[1]} x2={curve.second[0]} y2={curve.second[1]} /><path d={curve.path} /><circle cx={curve.first[0]} cy={curve.first[1]} r="5" /><circle cx={curve.second[0]} cy={curve.second[1]} r="5" /><text x="28" y="299">时间 0 → 1 · 进度纵轴自动缩放</text></svg>
      <div className="easing-runway" ref={runwayRef} aria-label="位移动画预览"><div className="easing-dot" ref={dotRef} /></div><div className="utility-actions"><button type="button" className="primary-button" onClick={play}>播放预览</button><button type="button" disabled={!hasPreview} onClick={stop}>停止并复位</button></div><p className="utility-muted" role="status">{message || (playing ? "正在预览…" : "点击播放，比较不同曲线的运动节奏。")}</p>
      <TextUtilityResult key={curve.css} text={curve.css} name="easing.css" mime="text/css" /></>}</section></div>
  </UtilityShell>;
}
