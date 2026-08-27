"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiCopy, FiFile, FiUploadCloud } from "react-icons/fi";
import { FileDropZone } from "./file-drop-zone";
import { compareFileHash, hashAlgorithms, type HashAlgorithm, type HashResults, type HashWorkerMessage } from "../lib/file-hash";

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
  return `${(bytes / 1024 ** (index + 1)).toFixed(2)} ${units[index]}`;
}

export default function FileHash() {
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<HashAlgorithm[]>(["SHA-256"]);
  const [results, setResults] = useState<HashResults>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [expected, setExpected] = useState("");
  const [toast, setToast] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const comparison = compareFileHash(expected, results);
  const resultRows = hashAlgorithms.filter((algorithm) => results[algorithm]);

  function resetCalculation() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
    setProgress(0);
    setResults({});
    setStatus("");
    setError("");
  }

  function chooseFile(nextFile: File) {
    resetCalculation();
    setFile(nextFile);
  }

  function toggleAlgorithm(algorithm: HashAlgorithm) {
    if (running) return;
    resetCalculation();
    setSelected((previous) => previous.includes(algorithm)
      ? previous.filter((item) => item !== algorithm)
      : [...previous, algorithm]);
  }

  function start() {
    if (!file || !selected.length || workerRef.current) return;
    setResults({});
    setError("");
    setProgress(0);
    setRunning(true);
    setStatus("正在初始化计算…");
    let worker: Worker | null = null;
    const fail = (message: string) => {
      worker?.terminate();
      workerRef.current = null;
      setRunning(false);
      setStatus("");
      setError(message);
    };
    try {
      worker = new Worker(new URL("../workers/file-hash.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<HashWorkerMessage>) => {
        if (workerRef.current !== worker) return;
        const message = event.data;
        if (message.type === "progress") {
          setProgress(message.total ? Math.floor(message.loaded / message.total * 100) : 0);
          setStatus("正在计算…");
        } else if (message.type === "done") {
          setResults(message.results);
          setProgress(100);
          setRunning(false);
          setStatus("计算完成");
          worker?.terminate();
          workerRef.current = null;
        } else if (message.type === "error") {
          fail(message.message);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (workerRef.current === worker) fail("计算组件加载失败，请刷新页面后重试。");
      };
      worker.onmessageerror = () => {
        if (workerRef.current === worker) fail("无法读取计算结果，请重新计算。");
      };
      worker.postMessage({ file, algorithms: selected });
    } catch {
      fail("浏览器无法启动计算，请使用新版浏览器后重试。");
    }
  }

  function cancel() {
    resetCalculation();
    setStatus("已取消计算，可重新开始。");
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast("已复制");
    } catch {
      setToast("复制失败，请长按或选中结果手动复制。");
    }
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  return (
    <main className="tool-shell file-hash-shell">
      <Link className="back-link" href="/"><span aria-hidden="true">←</span> Eason的工具箱</Link>
      <header className="tool-header file-hash-header">
        <h1>文件哈希计算工具</h1>
        <p>计算文件哈希值，快速核对文件是否一致。</p>
      </header>
      <section className="converter-card file-hash-card">
        <FileDropZone className="image-compressor-picker file-hash-picker" ariaLabel="选择或拖入文件" onFile={chooseFile}>
          <FiUploadCloud aria-hidden="true" />
          <strong>{file ? "重新选择文件" : "选择文件"}</strong>
          <span>点击选择或将文件拖入这里，支持任意格式</span>
        </FileDropZone>
        {file && <div className="file-hash-file"><FiFile aria-hidden="true" /><strong>{file.name}</strong><span>{fileSize(file.size)}</span></div>}
        <fieldset className="file-hash-algorithms" disabled={running}>
          <legend>计算算法</legend>
          <div>{hashAlgorithms.map((algorithm) => <label key={algorithm}>
            <input type="checkbox" checked={selected.includes(algorithm)} onChange={() => toggleAlgorithm(algorithm)} />
            <span>{algorithm}</span>
          </label>)}</div>
        </fieldset>
        <div className="file-hash-controls">
          <button type="button" className="convert-button" disabled={!file || !selected.length || running} onClick={start}>{running ? "正在计算…" : "开始计算"}</button>
          {running && <button type="button" className="file-hash-cancel" onClick={cancel}>取消计算</button>}
        </div>
        {!selected.length && <p className="file-hash-note">请至少选择一种算法。</p>}
        {(running || progress === 100) && <div className="file-hash-progress"><progress aria-label="计算进度" value={progress} max={100} /><span>{progress}%</span></div>}
        <p className="file-hash-status" role="status">{status}</p>
        {error && <p className="message" role="alert">{error}</p>}
        <section className="file-hash-results" aria-labelledby="hash-results-title">
          <div className="file-hash-heading"><h2 id="hash-results-title">计算结果</h2><button type="button" className="copy-button" disabled={!resultRows.length} onClick={() => copy(resultRows.map((algorithm) => `${algorithm}: ${results[algorithm]}`).join("\n"))}><FiCopy aria-hidden="true" />复制全部</button></div>
          {resultRows.length ? <div className="file-hash-result-list">{resultRows.map((algorithm) => <div className="file-hash-result" key={algorithm}>
            <div><strong>{algorithm}</strong><button type="button" className="copy-button" aria-label={`复制 ${algorithm}`} onClick={() => copy(results[algorithm]!)}>复制</button></div>
            <code>{results[algorithm]}</code>
          </div>)}</div> : <div className="file-hash-empty file-tool-empty">{running ? "计算中，请稍候…" : "选择文件并开始计算，结果将显示在这里。"}</div>}
        </section>
        <div className="file-hash-compare">
          <label htmlFor="hash-expected">哈希值比对 <span>（可选）</span></label>
          <textarea id="hash-expected" rows={2} value={expected} spellCheck={false} autoCapitalize="none" autoCorrect="off" onChange={(event) => setExpected(event.target.value)} placeholder="粘贴待核对的哈希值，自动识别算法" />
          {comparison.message && <p className={`file-hash-comparison is-${comparison.state}`} role="status">{comparison.message}</p>}
        </div>
        <p className="file-hash-note">校验推荐 SHA-256；MD5、SHA-1 仅用于兼容旧校验值，不适合安全用途。</p>
      </section>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
