"use client";

import { useEffect, useRef, useState } from "react";
import { UtilityShell } from "./utility-shell";

const colors = ["#786FA6", "#E06B65", "#2A9D8F"];
type Formula = { expression: string; enabled: boolean };

export default function FunctionPlotter() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [formulas, setFormulas] = useState<Formula[]>([
    { expression: "sin(x)", enabled: true },
    { expression: "0.1 * x^2 - 2", enabled: true },
    { expression: "cos(x) + 3", enabled: false },
  ]);
  const [bounds, setBounds] = useState({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
  const [plotVersion, setPlotVersion] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const container = chartRef.current;
    if (!container) return;
    let cancelled = false;
    const render = async () => {
      try {
        const active = formulas.filter((formula) => formula.enabled && formula.expression.trim());
        if (!active.length) throw new Error("请至少启用一个函数。");
        if (!(bounds.xMin < bounds.xMax) || !(bounds.yMin < bounds.yMax)) throw new Error("坐标轴最小值必须小于最大值。");
        const plotModule = await import("function-plot");
        const candidate = plotModule.default as unknown;
        const functionPlot = typeof candidate === "function" ? plotModule.default : (candidate as { default: typeof plotModule.default }).default;
        if (cancelled) return;
        container.replaceChildren();
        functionPlot({
          target: container,
          width: Math.max(320, Math.floor(container.clientWidth)),
          height: Math.max(360, Math.min(520, Math.floor(container.clientWidth * 0.68))),
          grid: true,
          disableZoom: false,
          xAxis: { domain: [bounds.xMin, bounds.xMax], label: "x" },
          yAxis: { domain: [bounds.yMin, bounds.yMax], label: "y" },
          data: active.map((formula) => ({ fn: formula.expression, color: colors[formulas.indexOf(formula)], graphType: "polyline", sampler: "builtIn", nSamples: 1200 })),
        });
        setMessage("图像已绘制，可滚轮缩放并拖动查看。");
      } catch (error) {
        if (!cancelled) { container.replaceChildren(); setMessage((error as Error).message || "函数表达式无法绘制。"); }
      }
    };
    void render();
    const observer = new ResizeObserver(() => { if (!cancelled) void render(); });
    observer.observe(container);
    return () => { cancelled = true; observer.disconnect(); container.replaceChildren(); };
  }, [plotVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateFormula(index: number, patch: Partial<Formula>) {
    setFormulas((current) => current.map((formula, i) => i === index ? { ...formula, ...patch } : formula));
    setMessage("");
  }

  function downloadSvg() {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    const content = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "function-plot.svg"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return <UtilityShell title="函数图像绘制" description="输入数学函数，绘制可缩放、可拖动的二维坐标图像。">
    <div className="function-plot-layout">
      <div className="utility-panel utility-controls function-controls">
        <h2>函数设置</h2>
        <div className="function-formulas">{formulas.map((formula, index) => <div className="function-formula" key={index}>
          <label className="utility-checkbox"><input type="checkbox" checked={formula.enabled} onChange={(event) => updateFormula(index, { enabled: event.target.checked })} /><i style={{ background: colors[index] }} />y{index + 1}</label>
          <input aria-label={`函数 y${index + 1}`} value={formula.expression} maxLength={120} spellCheck={false} placeholder="例如：sin(x)" onChange={(event) => updateFormula(index, { expression: event.target.value })} />
        </div>)}</div>
        <div className="function-bounds">
          {(["xMin", "xMax", "yMin", "yMax"] as const).map((key) => <label key={key}>{key.replace("Min", " 最小").replace("Max", " 最大")}<input type="number" aria-label={key} value={bounds[key]} step="1" onChange={(event) => setBounds((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}
        </div>
        <button className="primary-button" type="button" onClick={() => setPlotVersion((value) => value + 1)}>绘制函数图像</button>
        <div className="utility-actions"><button type="button" onClick={() => { setBounds({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 }); setPlotVersion((value) => value + 1); }}>恢复坐标范围</button><button type="button" onClick={downloadSvg}>下载 SVG</button></div>
        <p className="utility-muted">支持 +、−、*、/、^、括号，以及 sin、cos、tan、sqrt、log、abs、exp 等函数。</p>
      </div>
      <div className="utility-panel function-chart-panel">
        <div className="utility-heading"><h2>图像预览</h2><span className="utility-muted">滚轮缩放 · 拖动平移</span></div>
        <div className="function-chart" ref={chartRef} aria-label="函数图像坐标系" />
        <p role="status" className="utility-muted">{message}</p>
      </div>
    </div>
  </UtilityShell>;
}
