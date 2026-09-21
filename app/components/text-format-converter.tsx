"use client";

import { useMemo, useRef, useState } from "react";
import { FiClipboard, FiCopy, FiDownload, FiFileText, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { textTransformGroups, transformText, type TextTransformId } from "../lib/text-format";
import { UtilityShell } from "./utility-shell";

const maxTextLength = 500_000;

function downloadText(value: string, name: string) {
  const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TextFormatConverter() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [transform, setTransform] = useState<TextTransformId>("upper");
  const [message, setMessage] = useState("");
  const output = useMemo(() => transformText(input, transform), [input, transform]);

  function updateInput(value: string) {
    setInput(value.slice(0, maxTextLength));
    setMessage(value.length > maxTextLength ? "文字过长，仅保留前50万个字符。" : "");
  }

  async function pasteText() {
    try {
      const value = await navigator.clipboard.readText();
      updateInput(value);
      if (value.length <= maxTextLength) setMessage("已粘贴剪贴板内容。");
    } catch {
      setMessage("无法读取剪贴板，请在输入框内手动粘贴。");
    }
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(output);
      setMessage("转换结果已复制。");
    } catch {
      setMessage("复制失败，请手动选择结果复制。");
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage("文本文件不能超过5 MB。");
      return;
    }
    try {
      const value = await file.text();
      updateInput(value);
      if (value.length <= maxTextLength) setMessage(`已导入 ${file.name}。`);
    } catch {
      setMessage("无法读取这个文本文件。");
    }
  }

  return (
    <UtilityShell title="文本格式转换工具" description="转换英文命名格式、简繁体、全半角，并整理文本行与空白。">
      <section className="utility-panel text-format-options" aria-labelledby="text-format-options-title">
        <div className="utility-heading">
          <h2 id="text-format-options-title">选择转换格式</h2>
          <span className="utility-muted">实时转换，不会上传文本</span>
        </div>
        {textTransformGroups.map((group) => (
          <div className="text-format-group" key={group.name}>
            <strong>{group.name}</strong>
            <div className="text-format-option-grid">
              {group.options.map(([id, label, example]) => (
                <button type="button" key={id} aria-pressed={transform === id} onClick={() => { setTransform(id); setMessage(""); }}>
                  <span>{label}</span><small>{example}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="utility-columns text-format-columns">
        <section className="utility-panel utility-controls text-format-panel" aria-labelledby="text-format-input-title">
          <div className="utility-heading">
            <h2 id="text-format-input-title">原始文本</h2>
            <div className="utility-actions">
              <input ref={fileInput} type="file" accept=".txt,.md,.csv,.log,.json,text/plain" hidden onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              <button type="button" onClick={() => fileInput.current?.click()}><FiFileText aria-hidden="true" />导入</button>
              <button type="button" onClick={() => void pasteText()}><FiClipboard aria-hidden="true" />粘贴</button>
              <button type="button" disabled={!input} onClick={() => { setInput(""); setMessage(""); }}><FiTrash2 aria-hidden="true" />清空</button>
            </div>
          </div>
          <textarea aria-label="原始文本" rows={16} maxLength={maxTextLength} spellCheck={false} placeholder="在这里输入、粘贴或导入文本…" value={input} onChange={(event) => updateInput(event.target.value)} />
          <div className="text-format-stats"><span>{Array.from(input).length.toLocaleString("zh-CN")} 字符</span><span>{input ? input.split(/\r?\n/).length : 0} 行</span></div>
        </section>

        <section className="utility-panel utility-controls text-format-panel" aria-labelledby="text-format-output-title">
          <div className="utility-heading">
            <h2 id="text-format-output-title">转换结果</h2>
            <div className="utility-actions">
              <button type="button" disabled={!output} onClick={() => { setInput(output); setMessage("结果已作为新的原始文本。"); }}><FiRefreshCw aria-hidden="true" />继续转换</button>
              <button type="button" disabled={!output} onClick={() => void copyOutput()}><FiCopy aria-hidden="true" />复制</button>
              <button type="button" disabled={!output} onClick={() => downloadText(output, "converted-text.txt")}><FiDownload aria-hidden="true" />下载</button>
            </div>
          </div>
          <textarea aria-label="转换结果" rows={16} readOnly spellCheck={false} placeholder="转换结果会显示在这里" value={output} />
          <div className="text-format-stats"><span>{Array.from(output).length.toLocaleString("zh-CN")} 字符</span><span>{output ? output.split(/\r?\n/).length : 0} 行</span></div>
        </section>
      </div>
      {message ? <p className="utility-muted text-format-message" role="status">{message}</p> : null}
    </UtilityShell>
  );
}
