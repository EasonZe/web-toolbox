"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Wheel } from "spin-wheel";
import { FiUploadCloud, FiDownload } from "react-icons/fi";
import { parseNames, randomWinner } from "../lib/lottery";
import { FileDropZone } from "./file-drop-zone";
import { UtilityShell } from "./utility-shell";

const example = "小明\n小红\n小张\n小李\n小王\n小陈";
export default function LotteryWheel() {
  const [text, setText] = useState(example);
  const [exclude, setExclude] = useState(true);
  const [removed, setRemoved] = useState<number[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [winner, setWinner] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [column, setColumn] = useState(0);
  const [skipHeader, setSkipHeader] = useState(true);
  const holder = useRef<HTMLDivElement>(null);
  const wheel = useRef<Wheel | null>(null);
  const running = useRef(false);
  const importJob = useRef(0);
  const selection = useRef<{ name: string; index: number; exclude: boolean } | null>(null);
  const parsed = useMemo(() => {
    try { return { names: parseNames(text), error: "" }; }
    catch (e) { return { names: [] as string[], error: (e as Error).message }; }
  }, [text]);
  // Keep the wheel fixed after a draw so the pointer continues to show the winning name.
  useEffect(() => {
    let disposed = false;
    void import("spin-wheel").then(({ Wheel }) => {
      if (disposed || !holder.current) return;
      wheel.current = new Wheel(holder.current, {
        items: (parsed.names.length ? parsed.names : ["等待名单"]).map((label) => ({ label })),
        isInteractive: false, pointerAngle: 0,
        itemBackgroundColors: ["#DAD7ED", "#CFE2EF", "#DFE9D6", "#F2DDCF", "#EED8E4", "#D2E7E2"],
        itemLabelColors: ["#203641"], itemLabelFont: "sans-serif", itemLabelFontSizeMax: 20,
        borderColor: "#ffffff", borderWidth: 4, lineColor: "#ffffff", lineWidth: 2,
        onRest: () => {
          const drawn = selection.current;
          if (!running.current || !drawn || disposed) return;
          running.current = false;
          setBusy(false); setWinner(drawn.name);
          setHistory((h) => [drawn.name, ...h].slice(0, 500));
          if (drawn.exclude) setRemoved((v) => [...v, drawn.index]);
        },
      });
      setReady(true);
    }).catch(() => { if (!disposed) setError("转盘加载失败，请刷新重试。"); });
    return () => { disposed = true; wheel.current?.remove(); wheel.current = null; };
  }, [parsed.names]);
  useEffect(() => () => { importJob.current++; running.current = false; }, []);

  function updateNames(next: string) {
    if (next !== text) setReady(false);
    setText(next); setRemoved([]); setHistory([]); setWinner(""); setError("");
  }
  function spin() {
    if (running.current || !wheel.current) return;
    try {
      const candidates = parsed.names.map((name, index) => ({ name, index })).filter((v) => !exclude || !removed.includes(v.index));
      const selected = candidates[randomWinner(candidates.length)];
      selection.current = { ...selected, exclude };
      running.current = true; setBusy(true); setWinner(""); setError("");
      wheel.current.spinToItem(selected.index, matchMedia("(prefers-reduced-motion: reduce)").matches ? 100 : 4500, true, 5, 1);
    } catch (e) { running.current = false; setBusy(false); setError((e as Error).message); }
  }
  async function importFile(file: File) {
    const job = ++importJob.current;
    setReading(true); setError("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("名单文件不能超过5 MB。");
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension === "txt") {
        const value = await file.text(); parseNames(value);
        if (job === importJob.current) { updateNames(value); setRows([]); }
      } else {
        let data: string[][];
        if (extension === "csv") {
          const { default: Papa } = await import("papaparse");
          const result = Papa.parse<string[]>(await file.text(), { skipEmptyLines: true });
          if (result.errors.some((e) => e.type === "Quotes")) throw new Error("CSV引号格式有误，请检查文件。");
          data = result.data;
        } else if (extension === "xlsx") {
          const { readSheet } = await import("read-excel-file/browser");
          const result = await readSheet(file);
          data = result.map((row) => row.map((cell) => cell == null ? "" : String(cell)));
        } else throw new Error("请选择TXT、CSV或Excel（.xlsx）名单。");
        if (!data.length || data.length > 501 || data.some((row) => row.length > 100)) throw new Error("表格为空或超过500项/100列，请整理后重试。");
        if (job === importJob.current) { setRows(data); setColumn(0); setSkipHeader(true); }
      }
    } catch (e) { if (job === importJob.current) setError(e instanceof Error ? e.message : "名单读取失败。"); }
    finally { if (job === importJob.current) setReading(false); }
  }
  function applyRows() {
    try {
      const value = rows.slice(skipHeader ? 1 : 0).map((row) => row[column] ?? "").join("\n");
      if (!parseNames(value).length) throw new Error("选中的列没有名单。");
      updateNames(value); setRows([]);
    } catch (e) { setError((e as Error).message); }
  }
  function downloadHistory() {
    const url = URL.createObjectURL(new Blob(["\uFEFF" + history.map((name, index) => `${history.length - index}. ${name}`).join("\n")], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "抽签记录.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const remaining = parsed.names.length - (exclude ? removed.length : 0);
  return <UtilityShell title="抽签大转盘" description="导入名单或手动填写，转动大转盘抽取幸运选项。">
    <div className="utility-columns">
      <div className="utility-panel wheel-panel">
        <div className="wheel-frame"><div className="wheel-pointer" aria-hidden="true" /><div ref={holder} className="wheel-canvas" role="img" aria-label={`抽签转盘，共${parsed.names.length}项`} /></div>
        <div className="wheel-result" role="status">{busy ? "转盘正在转动…" : winner ? `抽中了：${winner}` : "好运即将揭晓"}</div>
        <button className="primary-button" type="button" disabled={busy || reading || !ready || remaining < 1 || !!parsed.error} onClick={spin}>{busy ? "正在抽取…" : "开始抽签"}</button>
        <p className="utility-muted">{exclude ? `剩余 ${remaining} / ${parsed.names.length} 项可抽取` : `共 ${parsed.names.length} 项，可重复抽取`}</p>
      </div>
      <div className="utility-panel utility-controls">
        <h2>抽奖名单</h2>
        <FileDropZone className="video-file-picker" accept=".txt,.csv,.xlsx" disabled={busy || reading} onFile={importFile}><FiUploadCloud /><strong>{reading ? "正在读取名单…" : "导入名单 / 拖入文件"}</strong><span>TXT、CSV、Excel（.xlsx），最多500项</span></FileDropZone>
        {rows.length > 0 && <div className="utility-controls import-options"><label>选择姓名所在列<select value={column} onChange={(e) => setColumn(Number(e.target.value))}>{Array.from({ length: Math.max(...rows.map((r) => r.length)) }, (_, i) => <option value={i} key={i}>第{i + 1}列 · {rows[0]?.[i]?.slice(0, 20) || "未命名"}</option>)}</select></label><label className="utility-checkbox"><input type="checkbox" checked={skipHeader} onChange={(e) => setSkipHeader(e.target.checked)} />首行为标题，跳过</label><button type="button" onClick={applyRows}>使用此列名单</button></div>}
        <label>每行一个名字或选项<textarea value={text} maxLength={20500} rows={8} disabled={busy || reading} onChange={(e) => updateNames(e.target.value)} /></label>
        <p className="utility-muted">每行等概率；同名多行会增加抽中机会。</p>
        <label className="utility-checkbox"><input type="checkbox" checked={exclude} disabled={busy} onChange={(e) => { setExclude(e.target.checked); setRemoved([]); }} />抽中后不再重复抽取</label>
        <div className="utility-actions"><button disabled={busy || reading} onClick={() => updateNames([...new Set(parsed.names)].join("\n"))}>去除重复</button><button disabled={busy || reading} onClick={() => { setRemoved([]); setHistory([]); setWinner(""); }}>重置抽签</button><button disabled={busy || reading} onClick={() => updateNames("")}>清空名单</button></div>
      </div>
    </div>
    {(error || parsed.error) && <p className="utility-error" role="alert">{error || parsed.error}</p>}
    <div className="utility-panel"><div className="utility-heading"><h2>抽签记录</h2><button disabled={!history.length} onClick={downloadHistory}><FiDownload />导出记录</button></div>{history.length ? <ol className="draw-history">{history.map((name, i) => <li key={i}>{name}</li>)}</ol> : <p className="utility-muted">抽签结果会显示在这里。</p>}</div>
  </UtilityShell>;
}
