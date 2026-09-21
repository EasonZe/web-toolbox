"use client";

import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, rectangularSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from "@codemirror/search";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiClipboard, FiCopy, FiDownload, FiFileText, FiRotateCcw, FiRotateCw, FiSearch, FiTrash2 } from "react-icons/fi";
import { countText } from "../lib/word-count";
import { UtilityShell } from "./utility-shell";

const draftStorageKey = "eason-toolbox-plain-text-draft";
const maxFileSize = 5 * 1024 * 1024;
const maxTextLength = 1_000_000;

function safeFileName(value: string) {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 80);
  if (!normalized) return "未命名.txt";
  return /\.txt$/i.test(normalized) ? normalized : `${normalized}.txt`;
}

function downloadText(value: string, name: string) {
  const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName(name);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PlainTextEditor() {
  const editorHost = useRef<HTMLDivElement>(null);
  const editorView = useRef<EditorView | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const autosaveRef = useRef(true);
  const wrapCompartment = useRef(new Compartment());
  const fontCompartment = useRef(new Compartment());
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("未命名.txt");
  const [lineWrap, setLineWrap] = useState(true);
  const [fontSize, setFontSize] = useState(16);
  const [autosave, setAutosave] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [message, setMessage] = useState("");
  const stats = useMemo(() => countText(text), [text]);

  useEffect(() => {
    if (!editorHost.current || editorView.current) return;

    let initialText = "";
    try {
      initialText = (window.localStorage.getItem(draftStorageKey) || "").slice(0, maxTextLength);
    } catch { /* Storage can be disabled. */ }

    setText(initialText);
    const view = new EditorView({
      parent: editorHost.current,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          wrapCompartment.current.of(EditorView.lineWrapping),
          fontCompartment.current.of(EditorView.theme({ ".cm-content": { fontSize: "16px" } })),
          EditorView.contentAttributes.of({ "aria-label": "纯文本编辑区域", spellcheck: "false" }),
          EditorState.transactionFilter.of((transaction) => (
            transaction.newDoc.length <= maxTextLength ? transaction : []
          )),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const nextText = update.state.doc.toString();
              setText(nextText);
              if (autosaveRef.current) {
                try { window.localStorage.setItem(draftStorageKey, nextText); } catch { /* Ignore unavailable storage. */ }
              }
            }
            if (update.docChanged || update.transactions.length) {
              setCanUndo(undoDepth(update.state) > 0);
              setCanRedo(redoDepth(update.state) > 0);
            }
          }),
        ],
      }),
    });
    editorView.current = view;
    setCanUndo(undoDepth(view.state) > 0);
    setCanRedo(redoDepth(view.state) > 0);
    return () => {
      view.destroy();
      editorView.current = null;
    };
  }, []);

  useEffect(() => {
    autosaveRef.current = autosave;
    if (!autosave) {
      try { window.localStorage.removeItem(draftStorageKey); } catch { /* Ignore unavailable storage. */ }
    } else if (editorView.current) {
      try { window.localStorage.setItem(draftStorageKey, editorView.current.state.doc.toString()); } catch { /* Ignore unavailable storage. */ }
    }
  }, [autosave]);

  function replaceDocument(value: string) {
    const next = value.slice(0, maxTextLength);
    const view = editorView.current;
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    view.focus();
  }

  function createNewDocument() {
    if (text && !window.confirm("确定清空当前文本并新建文档吗？")) return;
    replaceDocument("");
    setFileName("未命名.txt");
    setMessage("已新建空白文档。");
  }

  async function openFile(file: File | undefined) {
    if (!file) return;
    if (file.size > maxFileSize) {
      setMessage("文本文件不能超过5 MB。");
      return;
    }
    try {
      const value = await file.text();
      replaceDocument(value);
      setFileName(safeFileName(file.name));
      setMessage(value.length > maxTextLength ? "文件过长，仅载入前100万个字符。" : `已打开 ${file.name}。`);
    } catch {
      setMessage("无法读取这个文本文件。");
    }
  }

  async function pasteText() {
    const view = editorView.current;
    if (!view) return;
    try {
      const value = await navigator.clipboard.readText();
      const range = view.state.selection.main;
      const available = maxTextLength - (view.state.doc.length - (range.to - range.from));
      const insert = value.slice(0, Math.max(0, available));
      view.dispatch({ changes: { from: range.from, to: range.to, insert }, selection: { anchor: range.from + insert.length } });
      view.focus();
      setMessage(insert.length < value.length ? "内容过长，仅粘贴到100万个字符上限。" : "已粘贴剪贴板内容。");
    } catch {
      setMessage("无法读取剪贴板，请在编辑器内手动粘贴。");
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("全文已复制。");
    } catch {
      setMessage("复制失败，请在编辑器内手动选择文字。");
    }
  }

  function toggleLineWrap() {
    const next = !lineWrap;
    setLineWrap(next);
    editorView.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(next ? EditorView.lineWrapping : []),
    });
  }

  function changeFontSize(next: number) {
    setFontSize(next);
    editorView.current?.dispatch({
      effects: fontCompartment.current.reconfigure(EditorView.theme({ ".cm-content": { fontSize: `${next}px` } })),
    });
  }

  return (
    <UtilityShell title="纯文本编辑器" description="打开、编辑、查找替换并下载纯文本，草稿只保存在当前浏览器。">
      <section className="utility-panel plain-text-editor-panel" aria-label="纯文本编辑器">
        <div className="plain-text-toolbar">
          <div className="utility-actions">
            <input ref={fileInput} type="file" accept=".txt,.md,.csv,.log,.json,.xml,.yaml,.yml,text/plain" hidden onChange={(event) => { void openFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
            <button type="button" onClick={createNewDocument}><FiTrash2 aria-hidden="true" />新建</button>
            <button type="button" onClick={() => fileInput.current?.click()}><FiFileText aria-hidden="true" />打开</button>
            <button type="button" disabled={!canUndo} onClick={() => editorView.current && undo(editorView.current)}><FiRotateCcw aria-hidden="true" />撤销</button>
            <button type="button" disabled={!canRedo} onClick={() => editorView.current && redo(editorView.current)}><FiRotateCw aria-hidden="true" />重做</button>
            <button type="button" onClick={() => editorView.current && openSearchPanel(editorView.current)}><FiSearch aria-hidden="true" />查找替换</button>
            <button type="button" onClick={() => void pasteText()}><FiClipboard aria-hidden="true" />粘贴</button>
            <button type="button" disabled={!text} onClick={() => void copyText()}><FiCopy aria-hidden="true" />复制全文</button>
          </div>
          <div className="plain-text-settings">
            <button type="button" aria-pressed={lineWrap} onClick={toggleLineWrap}>自动换行</button>
            <label>字号<select aria-label="编辑器字号" value={fontSize} onChange={(event) => changeFontSize(Number(event.target.value))}><option value="14">14</option><option value="16">16</option><option value="18">18</option><option value="20">20</option></select></label>
            <label className="plain-text-autosave"><input type="checkbox" checked={autosave} onChange={(event) => setAutosave(event.target.checked)} />自动保存草稿</label>
          </div>
        </div>

        <div className="plain-text-name-row">
          <label htmlFor="plain-text-file-name">文件名</label>
          <input id="plain-text-file-name" value={fileName} maxLength={80} onChange={(event) => setFileName(event.target.value)} />
          <button type="button" className="primary-button" disabled={!text} onClick={() => downloadText(text, fileName)}><FiDownload aria-hidden="true" />下载 TXT</button>
        </div>

        <div className="plain-text-editor" ref={editorHost} />
        <footer className="plain-text-status">
          <span>{stats.characters.toLocaleString("zh-CN")} 字符</span>
          <span>{stats.words.toLocaleString("zh-CN")} 词</span>
          <span>{stats.lines.toLocaleString("zh-CN")} 行</span>
          <span>UTF-8 {stats.bytes.toLocaleString("zh-CN")} 字节</span>
          <span>{autosave ? "草稿已自动保存在当前浏览器" : "自动保存已关闭"}</span>
        </footer>
        {message ? <p className="utility-muted plain-text-message" role="status">{message}</p> : null}
      </section>
    </UtilityShell>
  );
}
