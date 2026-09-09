"use client";

import { useMemo, useState } from "react";
import { commonBaseValues, convertBaseInteger } from "../lib/base-converter";
import { UtilityShell } from "./utility-shell";

const bases = [
  { value: 2, label: "二进制（2）" }, { value: 8, label: "八进制（8）" },
  { value: 10, label: "十进制（10）" }, { value: 16, label: "十六进制（16）" },
  { value: 36, label: "三十六进制（36）" },
];

export default function BaseConverter() {
  const [input, setInput] = useState("255");
  const [fromBase, setFromBase] = useState(10);
  const [toBase, setToBase] = useState(16);
  const [message, setMessage] = useState("");
  const result = useMemo(() => {
    try { return { value: convertBaseInteger(input, fromBase, toBase), error: "" }; }
    catch (error) { return { value: "", error: (error as Error).message }; }
  }, [input, fromBase, toBase]);
  const common = useMemo(() => {
    try { return commonBaseValues(input, fromBase); } catch { return []; }
  }, [input, fromBase]);

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("结果已复制。"); }
    catch { setMessage("复制失败，请手动选择结果复制。"); }
  }

  return <UtilityShell title="进制转换器" description="在 2 至 36 进制之间转换任意长度的有符号整数。">
    <div className="utility-columns base-converter-columns">
      <div className="utility-panel utility-controls">
        <h2>转换设置</h2>
        <label>原始进制<select aria-label="原始进制" value={fromBase} onChange={(event) => setFromBase(Number(event.target.value))}>{bases.map((base) => <option key={base.value} value={base.value}>{base.label}</option>)}</select></label>
        <label>输入整数<textarea aria-label="需要转换的整数" rows={5} value={input} maxLength={4096} placeholder="例如：FF、101101 或 255" spellCheck={false} onChange={(event) => { setInput(event.target.value); setMessage(""); }} /></label>
        <div className="utility-actions">
          <button type="button" onClick={() => { setFromBase(toBase); setToBase(fromBase); setInput(result.value || input); setMessage(""); }}>交换进制</button>
          <button type="button" onClick={() => { setInput(""); setMessage(""); }}>清空</button>
        </div>
        <label>目标进制<select aria-label="目标进制" value={toBase} onChange={(event) => setToBase(Number(event.target.value))}>{bases.map((base) => <option key={base.value} value={base.value}>{base.label}</option>)}</select></label>
        <div className={`base-converter-result${result.error ? " has-error" : ""}`}>
          <span>{result.error ? "输入有误" : `${toBase} 进制结果`}</span>
          <output aria-live="polite">{result.error || result.value || "等待输入"}</output>
        </div>
        <button className="primary-button" type="button" disabled={!result.value} onClick={() => void copy(result.value)}>复制转换结果</button>
        {message ? <p role="status">{message}</p> : null}
      </div>
      <div className="utility-panel">
        <div className="utility-heading"><h2>常用进制</h2><span className="utility-muted">自动更新</span></div>
        {common.length ? <div className="base-values">{common.map((item) => <button type="button" key={item.base} onClick={() => void copy(item.value)}><span>{item.base} 进制</span><strong>{item.value}</strong></button>)}</div> : <p className="utility-muted">输入有效整数后显示二、八、十、十六和三十六进制结果。</p>}
        <p className="utility-muted base-converter-note">支持负数、空格与下划线分组；二、八、十六进制也可使用 0b、0o、0x 前缀。整数使用 BigInt 计算，不受普通数字精度限制。</p>
      </div>
    </div>
  </UtilityShell>;
}
