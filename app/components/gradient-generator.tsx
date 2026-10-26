"use client";
/* eslint-disable @next/next/no-img-element -- Generated, local-only SVG preview. */
import { useMemo, useState } from "react";
import { defaultGradientOptions, addGradientStop, type GradientOptions, type GradientStop } from "../lib/design-generator-options";
import { gradientCss, gradientSvg, exportGradientPng } from "../lib/gradient-generator";
import { DesignColorInput } from "./design-color-input";
import { UtilityShell } from "./utility-shell";
import { TextUtilityResult } from "./text-utility-parts";
import { LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
export default function GradientGenerator() {
  const [options, setOptions] = useState(defaultGradientOptions), [width, setWidth] = useState(1280), [height, setHeight] = useState(720);
  const task = useLocalTask<Blob>();
  const result = useMemo(() => { try { return { css: gradientCss(options), svg: new Blob([gradientSvg(options, width, height)], { type: "image/svg+xml" }), error: "" }; } catch (cause) { return { css: "", svg: null, error: (cause as Error).message }; } }, [options, width, height]);
  const preview = useBlobUrl(result.svg);
  function change(next: Partial<GradientOptions>) { task.reset(); setOptions({ ...options, ...next }); }
  function stop(index: number, next: Partial<GradientStop>) { change({ stops: options.stops.map((item, i) => i === index ? { ...item, ...next } : item) }); }
  return <UtilityShell className="additional-utilities" title="渐变色生成器" description="调整颜色、透明度、方向及插值空间，生成 CSS、SVG 和 PNG；在本地完成。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>渐变设置</h2>
      <label className="utility-range-control"><span>角度<output>{options.angle}°</output></span><input type="range" min="0" max="360" value={options.angle} onChange={(e) => change({ angle: Number(e.target.value) })} /></label>
      <label>颜色插值<select value={options.space} onChange={(e) => change({ space: e.target.value as GradientOptions["space"] })}><option value="oklab">OKLab · 感知插值</option><option value="rgb">sRGB · 通道插值</option></select></label>
      <div className="utility-actions"><button type="button" disabled={options.stops.length >= 8 || !!result.error} onClick={() => change({ stops: addGradientStop(options.stops) })}>添加色标</button><button type="button" onClick={() => change({ stops: [...options.stops].reverse().map((item) => ({ ...item, position: 100 - item.position })) })}>反转渐变</button></div>
      {options.stops.map((item, index) => <fieldset className="design-stop-editor" key={index}><legend>色标 {index + 1}</legend><DesignColorInput label={`色标 ${index + 1} 颜色`} value={item.color} onChange={(color) => stop(index, { color })} /><label>位置（%）<input type="number" min="0" max="100" step="0.0001" value={item.position} readOnly={index === 0 || index === options.stops.length - 1} onChange={(e) => stop(index, { position: Number(e.target.value) })} /></label><label className="utility-range-control"><span>不透明度<output>{item.opacity}%</output></span><input type="range" min="0" max="100" value={item.opacity} onChange={(e) => stop(index, { opacity: Number(e.target.value) })} /></label>{index > 0 && index < options.stops.length - 1 && <button type="button" onClick={() => change({ stops: options.stops.filter((_, i) => i !== index) })}>移除此色标</button>}</fieldset>)}
      <div className="utility-columns"><label>输出宽度（px）<input type="number" min="1" max="8192" value={width} onChange={(e) => { task.reset(); setWidth(Number(e.target.value)); }} /></label><label>输出高度（px）<input type="number" min="1" max="8192" value={height} onChange={(e) => { task.reset(); setHeight(Number(e.target.value)); }} /></label></div>
      {result.error && <p className="utility-error" role="alert">{result.error}</p>}
      <p className="utility-muted">2–8 个严格递增色标，首尾固定 0% / 100%。采用透明度预乘插值；越出 sRGB 的颜色截到可显示范围。输出为采样后的 sRGB 渐变，保证 CSS / SVG / PNG 使用相同色标；不是完整连续 OKLab 曲线。</p>
    </section><section className="utility-panel utility-controls"><h2>渐变预览与导出</h2>{preview && <img className="image-diff-preview" src={preview} alt="渐变色预览" />}
      {result.css && <TextUtilityResult text={`background-image: ${result.css};`} name="gradient.css" mime="text/css" />}
      <div className="utility-actions">{result.svg && <LocalDownload blob={result.svg} name="gradient.svg" title="下载 SVG" />}<button type="button" disabled={!!result.error || task.busy} onClick={() => void task.run((signal) => exportGradientPng(options, width, height, signal))}>生成 PNG</button>{task.result && <LocalDownload blob={task.result} name="gradient.png" title="下载 PNG" />}</div><TaskFeedback task={task} />
      <p className="utility-muted">0° 向上、90° 向右；透明区域显示棋盘格。PNG / SVG 采用指定尺寸，CSS 随目标元素尺寸变化。移动端最多 16 MP，桌面最多 32 MP；不会自动缩小输出。</p>
    </section></div>
  </UtilityShell>;
}
