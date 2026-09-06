"use client";

import { useRef, useState } from "react";
import { UtilityShell } from "./utility-shell";

const keys = ["AC", "⌫", "(", ")", "7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "%", "+"];
export default function Calculator() {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("0");
  const [degrees, setDegrees] = useState(true);
  const [history, setHistory] = useState<{ expression: string; result: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const job = useRef(0);
  function input(value: string) {
    job.current++; setMessage("");
    if (value === "AC") { setExpression(""); setResult("0"); return; }
    if (value === "⌫") { setExpression((s) => s.slice(0, -1)); return; }
    const start = field.current?.selectionStart ?? expression.length;
    const end = field.current?.selectionEnd ?? expression.length;
    setExpression((expression.slice(0, start) + value + expression.slice(end)).slice(0, 200));
    requestAnimationFrame(() => { field.current?.focus(); field.current?.setSelectionRange(start + value.length, start + value.length); });
  }
  async function evaluate() {
    const currentJob = ++job.current;
    setBusy(true); setMessage("");
    try {
      const { calculate } = await import("../lib/calculator");
      const next = calculate(expression, degrees);
      if (currentJob !== job.current) return;
      setResult(next); setHistory((h) => [{ expression, result: next }, ...h].slice(0, 20));
    } catch (e) { if (currentJob === job.current) setMessage((e as Error).message); }
    finally { setBusy(false); }
  }
  return <UtilityShell title="计算器" description="支持四则运算、括号、百分比和常用科学计算。">
    <div className="utility-columns calculator-columns">
      <div className="utility-panel utility-controls">
        <div className="utility-heading"><h2>计算</h2><button onClick={() => { setDegrees(!degrees); job.current++; setMessage(""); }}>{degrees ? "角度 DEG" : "弧度 RAD"}</button></div>
        <label>算式<input ref={field} aria-label="算式" value={expression} maxLength={200} placeholder="例如：(12 + 8) × 5" onChange={(e) => { job.current++; setExpression(e.target.value); setMessage(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void evaluate(); } if (e.key === "Escape") input("AC"); }} /></label>
        <output className="calculator-result" aria-live="polite">{result}</output>
        <div className="calculator-science">{["sin(", "cos(", "tan(", "sqrt(", "log10(", "log(", "abs(", "π", "e", "^"].map((value) => <button key={value} onClick={() => input(value)}>{value === "sqrt(" ? "√" : value === "log(" ? "ln" : value.replace("(", "")}</button>)}</div>
        <div className="calculator-keys">{keys.map((key) => <button key={key} onClick={() => input(key)} aria-label={key === "⌫" ? "删除一位" : key === "AC" ? "清空" : key}>{key}</button>)}</div>
        <button className="primary-button" disabled={busy || !expression.trim()} onClick={() => void evaluate()}>{busy ? "正在计算…" : "="}</button>
        <div className="utility-actions"><button onClick={() => input(result)}>使用结果继续计算</button><button onClick={async () => { try { await navigator.clipboard.writeText(result); setMessage("结果已复制"); } catch { setMessage("复制失败，请手动选择结果复制。"); } }}>复制结果</button></div>
        {message && <p role="status">{message}</p>}
      </div>
      <div className="utility-panel"><div className="utility-heading"><h2>计算历史</h2><button disabled={!history.length} onClick={() => setHistory([])}>清空历史</button></div>{history.length ? <div className="calculator-history">{history.map((entry, i) => <button key={i} onClick={() => { job.current++; setExpression(entry.expression); setResult(entry.result); }}><span>{entry.expression}</span><strong>= {entry.result}</strong></button>)}</div> : <p className="utility-muted">计算后会在这里保留最近20条记录。</p>}</div>
    </div>
  </UtilityShell>;
}
