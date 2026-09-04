"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FiCheck, FiClipboard, FiRefreshCw, FiX } from "react-icons/fi";
import { fancyTextStyles, transformFancyText } from "../lib/fancy-text";

export default function FancyTextConverter() {
  const [value, setValue] = useState("Eason");
  const [copied, setCopied] = useState("");
  const results = useMemo(
    () => fancyTextStyles.map((style) => ({ ...style, value: transformFancyText(value, style) })),
    [value],
  );

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => current === id ? "" : current), 1600);
    } catch {
      setCopied("");
    }
  }

  return (
    <main className="tool-shell fancy-text-shell">
      <Link className="back-link" href="/"><span aria-hidden="true">←</span> 多功能工具箱</Link>
      <header className="tool-header">
        <h1>花体字转换器</h1>
        <p className="video-tool-description">输入英文、数字或符号，实时转换为可复制粘贴的Unicode花体字。</p>
      </header>

      <section className="converter-card fancy-text-card" aria-label="花体字转换">
        <div className="fancy-text-input-heading">
          <label htmlFor="fancy-text-input">输入文字</label>
          <div>
            <span>{Array.from(value).length}/200</span>
            <button type="button" onClick={() => setValue("Eason")}><FiRefreshCw aria-hidden="true" />恢复示例</button>
            {value ? <button type="button" onClick={() => setValue("")}><FiX aria-hidden="true" />清空</button> : null}
          </div>
        </div>
        <textarea id="fancy-text-input" value={value} maxLength={200} placeholder="请输入要转换的文字" onChange={(event) => setValue(event.target.value)} />
        <p className="fancy-text-tip">英文字母和数字会转换样式，中文、空格与普通符号会原样保留。</p>

        <div className="fancy-text-results-heading">
          <h2>转换结果</h2>
          <span>共 {results.length} 种样式</span>
        </div>
        <div className="fancy-text-results" aria-live="polite">
          {results.map((result) => (
            <article className="fancy-text-result" key={result.id}>
              <div><strong>{result.name}</strong><span>{result.example}</span></div>
              <output>{result.value || "在上方输入文字"}</output>
              <button type="button" disabled={!result.value} onClick={() => copyText(result.id, result.value)}>
                {copied === result.id ? <FiCheck aria-hidden="true" /> : <FiClipboard aria-hidden="true" />}
                {copied === result.id ? "已复制" : "复制"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
