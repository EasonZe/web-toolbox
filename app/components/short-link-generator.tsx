"use client";

import { useState } from "react";
import { UtilityShell } from "./utility-shell";

type Result = { url: string; destination: string; expiresAt: number | null };
export default function ShortLinkGenerator() {
  const [value, setValue] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [message, setMessage] = useState("");
  async function create() {
    if (busy) return;
    setBusy(true); setMessage(""); setResult(null);
    try {
      const response = await fetch("/api/short-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value, days }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成失败，请稍后重试。");
      if (typeof data.url !== "string" || !data.url.startsWith("https://tool.easonzhan.xyz/s/")) throw new Error("服务返回异常，请稍后重试。");
      setResult(data); setHistory((h) => [data, ...h].slice(0, 20)); setMessage("短链接生成完成");
    } catch (e) { setMessage(e instanceof Error ? e.message : "生成失败，请检查网络。"); }
    finally { setBusy(false); }
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setMessage("短链接已复制"); } catch { setMessage("复制失败，请手动选择链接复制。"); } }
  return <UtilityShell title="短链接生成工具" description="把长网址变为简短链接，方便分享和访问。">
    <form className="utility-controls" onSubmit={(e) => { e.preventDefault(); void create(); }}>
      <label>原始网址<div className="utility-inline"><input type="url" required maxLength={4096} value={value} disabled={busy} placeholder="https://example.com/…" onChange={(e) => { setValue(e.target.value); setResult(null); setMessage(""); }} /><button type="button" disabled={busy} onClick={async () => { try { const text = await navigator.clipboard.readText(); setValue(text.trim()); setResult(null); } catch { setMessage("无法读取剪贴板，请手动粘贴网址。"); } }}>粘贴</button></div></label>
      <label>有效期<select value={days} disabled={busy} onChange={(e) => setDays(Number(e.target.value))}><option value={1}>1天</option><option value={7}>7天</option><option value={30}>30天</option><option value={365}>1年</option><option value={0}>长期有效</option></select></label>
      <button className="primary-button" disabled={busy || !value.trim()}>{busy ? "正在生成…" : "生成短链接"}</button>
    </form>
    {message && <p role="status">{message}</p>}
    <div className="utility-panel utility-controls"><h2>生成结果</h2>{result ? <><div className="utility-inline"><input aria-label="生成的短链接" readOnly value={result.url} /><button onClick={() => void copy(result.url)}>复制</button></div><p className="utility-muted">{result.expiresAt ? `有效期至 ${new Date(result.expiresAt).toLocaleString("zh-CN")}` : "长期有效"}</p><a href={result.url} target="_blank" rel="noopener noreferrer">打开短链接 ↗</a></> : <p className="utility-muted">生成的链接会显示在这里，复制后即可分享给他人。</p>}</div>
    {history.length > 0 && <div className="utility-panel"><h2>本次生成记录</h2><div className="link-history">{history.map((r) => <div key={r.url}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.url}</a><span>{r.destination}</span><button onClick={() => void copy(r.url)}>复制</button></div>)}</div></div>}
  </UtilityShell>;
}
