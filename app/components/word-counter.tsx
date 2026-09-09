"use client";

import { useMemo, useState } from "react";
import { FiClipboard, FiCopy, FiTrash2 } from "react-icons/fi";
import { countText } from "../lib/word-count";
import { UtilityShell } from "./utility-shell";

const statItems = [
  ["characters", "字符（含空格）"],
  ["charactersNoWhitespace", "字符（不含空格）"],
  ["chineseCharacters", "中文字符"],
  ["words", "总词数"],
  ["westernWords", "英文 / 数字词"],
  ["paragraphs", "段落"],
  ["lines", "行数"],
  ["sentences", "句数"],
] as const;

export default function WordCounter() {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const stats = useMemo(() => countText(text), [text]);

  async function pasteText() {
    try {
      const value = await navigator.clipboard.readText();
      setText(value);
      setMessage(value ? "已粘贴剪贴板内容。" : "剪贴板中没有文字。");
    } catch {
      setMessage("无法读取剪贴板，请在输入框中手动粘贴。");
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("文字已复制。");
    } catch {
      setMessage("复制失败，请手动选择文字复制。");
    }
  }

  return (
    <UtilityShell
      title="字数统计工具"
      description="实时统计文字、词语、段落、行数和阅读时长。"
    >
      <div className="utility-columns word-counter-columns">
        <section className="utility-panel utility-controls word-counter-editor" aria-labelledby="word-counter-input-title">
          <div className="utility-heading">
            <h2 id="word-counter-input-title">输入文字</h2>
            <div className="utility-actions">
              <button type="button" onClick={() => void pasteText()}><FiClipboard aria-hidden="true" />粘贴</button>
              <button type="button" disabled={!text} onClick={() => void copyText()}><FiCopy aria-hidden="true" />复制</button>
              <button type="button" disabled={!text} onClick={() => { setText(""); setMessage(""); }}><FiTrash2 aria-hidden="true" />清空</button>
            </div>
          </div>
          <textarea
            aria-label="需要统计的文字"
            maxLength={1_000_000}
            placeholder="在这里输入或粘贴需要统计的文字…"
            rows={18}
            spellCheck={false}
            value={text}
            onChange={(event) => { setText(event.target.value); setMessage(""); }}
          />
          <div className="word-counter-footer">
            <span>UTF-8：{stats.bytes.toLocaleString("zh-CN")} 字节</span>
            <span>空白字符：{stats.whitespace.toLocaleString("zh-CN")}</span>
          </div>
          {message ? <p className="utility-muted" role="status">{message}</p> : null}
        </section>

        <section className="utility-panel word-counter-results" aria-labelledby="word-counter-results-title" aria-live="polite">
          <h2 id="word-counter-results-title">统计结果</h2>
          <div className="word-stat-grid">
            {statItems.map(([key, label]) => (
              <div className="word-stat" key={key}>
                <strong>{stats[key].toLocaleString("zh-CN")}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="reading-time-card">
            <span>预计阅读时长</span>
            <strong>{stats.readingMinutes ? `约 ${stats.readingMinutes} 分钟` : "0 分钟"}</strong>
            <small>按中文每分钟 500 字、英文每分钟 200 词估算</small>
          </div>
          <p className="utility-muted">总词数按每个中文字符和每组连续英文或数字分别计算。</p>
        </section>
      </div>
    </UtilityShell>
  );
}
