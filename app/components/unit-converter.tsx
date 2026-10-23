"use client";
import { useEffect, useState } from "react";
import { unitCategories, type UnitCategory } from "../lib/unit-definitions";
import type { convertUnits } from "../lib/unit-conversion";
import { UtilityShell } from "./utility-shell";
export default function UnitConverter() {
  const [category, setCategory] = useState<UnitCategory>("length"), [input, setInput] = useState("1"), [from, setFrom] = useState("m"), [to, setTo] = useState("cm");
  const [result, setResult] = useState<ReturnType<typeof convertUnits> | null>(null), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void import("../lib/unit-conversion").then(({ convertUnits }) => {
        if (cancelled) return;
        try { setResult(convertUnits(input, category, from, to)); setError(""); }
        catch (cause) { setResult(null); setError((cause as Error).message); }
      }).catch(() => { if (!cancelled) { setResult(null); setError("换算引擎加载失败，请刷新后重试。"); } });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [input, category, from, to]);
  const reset = () => { setResult(null); setError(""); setMessage(""); };
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setMessage("结果已复制。"); } catch { setMessage("无法复制，请手动选择结果。"); } }
  return <UtilityShell className="additional-utilities" title="单位换算" description="换算长度、面积、体积、质量、温度、速度、压力、能量、功率、时间和数据容量。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>换算设置</h2>
      <label>类别<select value={category} onChange={(e) => { const next = e.target.value as UnitCategory; reset(); setCategory(next); setFrom(unitCategories[next].units[0][0]); setTo(unitCategories[next].units[1][0]); }}>{Object.entries(unitCategories).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <label>输入数值<input inputMode="decimal" value={input} maxLength={128} spellCheck={false} onChange={(e) => { reset(); setInput(e.target.value); }} /></label>
      <label>原始单位<select value={from} onChange={(e) => { reset(); setFrom(e.target.value); }}>{unitCategories[category].units.map(([code, label]) => <option key={code} value={code}>{label} · {code}</option>)}</select></label>
      <label>目标单位<select value={to} onChange={(e) => { reset(); setTo(e.target.value); }}>{unitCategories[category].units.map(([code, label]) => <option key={code} value={code}>{label} · {code}</option>)}</select></label>
      <button type="button" onClick={() => { const value = result?.value; reset(); setFrom(to); setTo(from); if (value) setInput(value); }}>交换单位</button>
      <p className="utility-muted">支持小数和科学计数法；内部采用 40 位有效数字，结果显示最多 20 位。数据容量明确区分 KB / MB 与 KiB / MiB。</p>{error && <p className="utility-error" role="alert">{error}</p>}
    </section><section className="utility-panel utility-controls"><h2>换算结果</h2><output className="unit-conversion-result" aria-live="polite">{result ? `${result.value} ${to}` : error ? "请检查输入" : "正在换算…"}</output>
      <button type="button" disabled={!result} onClick={() => result && void copy(result.value)}>复制结果</button><p className="utility-muted" role="status">{message}</p>
      {result && <dl className="unit-results">{result.rows.map((row) => <div key={row.code}><dt>{row.label}<small>{row.code}</small></dt><dd>{row.value}</dd></div>)}</dl>}
    </section></div>
  </UtilityShell>;
}
