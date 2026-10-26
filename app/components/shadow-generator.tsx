"use client";
import { useMemo, useState } from "react";
import { defaultShadowLayer, shadowCss, type ShadowLayer } from "../lib/design-generator-options";
import { DesignColorInput } from "./design-color-input";
import { UtilityShell } from "./utility-shell";
import { TextUtilityResult } from "./text-utility-parts";
export default function ShadowGenerator() {
  const [layers, setLayers] = useState<ShadowLayer[]>([{ ...defaultShadowLayer }]), [selected, setSelected] = useState(0), [radius, setRadius] = useState(20), [surface, setSurface] = useState("#FFFFFF"), [background, setBackground] = useState("#EEF2F6");
  const result = useMemo(() => { try { return { value: shadowCss(layers, radius, surface, background), error: "" }; } catch (cause) { return { value: null, error: (cause as Error).message }; } }, [layers, radius, surface, background]);
  const current = layers[selected];
  function change(next: Partial<ShadowLayer>) { setLayers(layers.map((item, index) => index === selected ? { ...item, ...next } : item)); }
  function move(direction: number) { const index = selected + direction; if (index < 0 || index >= layers.length) return; const next = [...layers]; [next[index], next[selected]] = [next[selected], next[index]]; setLayers(next); setSelected(index); }
  return <UtilityShell className="additional-utilities" title="CSS 阴影生成器" description="调整多层内外阴影、偏移、模糊、扩展与透明度，实时预览并复制或下载 CSS。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>阴影设置</h2>
      <div className="utility-actions">{layers.map((_, index) => <button type="button" key={index} aria-pressed={selected === index} onClick={() => setSelected(index)}>阴影 {index + 1}</button>)}</div>
      <div className="utility-actions"><button type="button" disabled={layers.length >= 6} onClick={() => { setLayers([...layers, { ...current }]); setSelected(layers.length); }}>复制为新层</button><button type="button" disabled={layers.length <= 1} onClick={() => { setLayers(layers.filter((_, i) => i !== selected)); setSelected(Math.max(0, selected - 1)); }}>删除当前层</button><button type="button" disabled={selected === 0} onClick={() => move(-1)}>上移一层</button><button type="button" disabled={selected === layers.length - 1} onClick={() => move(1)}>下移一层</button></div>
      {([["水平偏移", "x", -200, 200], ["垂直偏移", "y", -200, 200], ["模糊半径", "blur", 0, 200], ["扩展半径", "spread", -100, 100]] as const).map(([label, key, min, max]) => <label className="utility-range-control" key={key}><span>{label}<output>{current[key]}px</output></span><input type="range" min={min} max={max} value={current[key]} onChange={(e) => change({ [key]: Number(e.target.value) })} /></label>)}
      <DesignColorInput label="阴影颜色" value={current.color} onChange={(color) => change({ color })} /><label className="utility-range-control"><span>阴影不透明度<output>{current.opacity}%</output></span><input type="range" min="0" max="100" value={current.opacity} onChange={(e) => change({ opacity: Number(e.target.value) })} /></label>
      <label className="utility-checkbox"><input type="checkbox" checked={current.inset} onChange={(e) => change({ inset: e.target.checked })} />内阴影（inset）</label>
      <p className="utility-muted">最多 6 层，第一层位于最上方。扩展可为负数，模糊不能为负数。此工具生成 box-shadow，非按透明图形轮廓计算的 drop-shadow；实际模糊外观由浏览器绘制。</p>
    </section><section className="utility-panel utility-controls"><h2>预览与 CSS</h2>
      <DesignColorInput label="卡片颜色" value={surface} onChange={setSurface} /><DesignColorInput label="预览背景" value={background} onChange={setBackground} />
      <label className="utility-range-control"><span>卡片圆角<output>{radius}px</output></span><input type="range" min="0" max="100" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></label>
      {result.error && <p className="utility-error" role="alert">{result.error}</p>}
      {result.value && <><div className="shadow-generator-preview" style={{ backgroundColor: result.value.background }}><div role="img" aria-label="当前多层阴影预览" style={{ backgroundColor: result.value.surface, borderRadius: result.value.radius, boxShadow: result.value.value }} /></div><TextUtilityResult text={result.value.text} name="box-shadow.css" mime="text/css" /></>}
    </section></div>
  </UtilityShell>;
}
