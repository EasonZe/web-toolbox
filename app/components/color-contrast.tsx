"use client";
import { useMemo, useState } from "react";
import { contrastHex, inspectContrast } from "../lib/color-contrast";
import { TextUtilityResult } from "./text-utility-parts";
import { UtilityShell } from "./utility-shell";
export default function ColorContrast() {
  const [foreground, setForeground] = useState("#1F3440"), [background, setBackground] = useState("#FFFFFF"), [opacity, setOpacity] = useState(100);
  const result = useMemo(() => { try { return { value: inspectContrast(foreground, background, opacity), error: "" }; } catch (cause) { return { value: null, error: (cause as Error).message }; } }, [foreground, background, opacity]);
  function picker(value: string) { try { return contrastHex(value); } catch { return "#000000"; } }
  return <UtilityShell className="additional-utilities" title="颜色对比度检查" description="检查文字与背景的 WCAG 对比度，支持文字透明度、实时预览和 CSS 导出。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>颜色设置</h2>
      {[["文字颜色", foreground, setForeground], ["背景颜色", background, setBackground]].map(([label, value, set]) => <div key={label as string} className="contrast-color-input"><label>{label as string}<input value={value as string} maxLength={7} spellCheck={false} onChange={(e) => (set as typeof setForeground)(e.target.value)} placeholder="#336699" /></label><input type="color" aria-label={`${label}取色`} value={picker(value as string)} onChange={(e) => (set as typeof setForeground)(e.target.value)} /></div>)}
      <label className="utility-range-control"><span>文字不透明度<output>{opacity}%</output></span><input type="range" min="0" max="100" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></label>
      <div className="utility-actions"><button type="button" onClick={() => { setForeground(background); setBackground(foreground); }}>交换颜色</button><button type="button" onClick={() => setForeground("#000000")}>黑色文字</button><button type="button" onClick={() => setForeground("#FFFFFF")}>白色文字</button></div>
      <p className="utility-muted">支持 3 / 6 位 HEX 色值。背景视为不透明，先将文字透明度叠加到背景，再计算 sRGB 相对亮度。显示结果经过取舍，是否达标使用未取舍数值判断。</p>
      {result.error && <p className="utility-error" role="alert">{result.error}</p>}
      <p className="utility-muted">大号文字指至少 24 CSS px，或约 18.67px 的粗体。图形/控件 3:1 检查仅表示这两个颜色之间的比值，不代表整个组件符合无障碍要求。</p>
      <a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html" target="_blank" rel="noreferrer">WCAG 对比度说明</a>
    </section><section className="utility-panel"><h2>对比结果</h2>{result.value ? <>
      <output className="contrast-ratio" aria-live="polite">{result.value.ratio.toFixed(3)} : 1</output>
      <div className="contrast-sample" style={{ backgroundColor: result.value.background, color: result.value.effective }}><strong>生活明朗，万物可爱</strong><p>这是一段普通字号的文字。Aa 0123456789</p><span aria-hidden="true">◇　＋　✓</span></div>
      <ul className="contrast-checks">{result.value.checks.map((item) => <li key={item.label}><span>{item.label} · {item.minimum}:1</span><strong>{item.pass ? "通过" : "未通过"}</strong></li>)}</ul>
      <TextUtilityResult text={result.value.css} name="contrast-colors.css" mime="text/css" />
    </> : <p className="utility-muted">请输入有效颜色后查看结果。</p>}</section></div>
  </UtilityShell>;
}
