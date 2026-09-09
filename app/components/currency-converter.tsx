"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiRefreshCw, FiRepeat } from "react-icons/fi";
import { UtilityShell } from "./utility-shell";
import { convertCurrency, currencies, formatCurrencyAmount, type CurrencyCode } from "../lib/currency";

type RateResponse = { base: string; quote: string; rate: number; date: string; fetchedAt: number; source?: string; error?: string };

export default function CurrencyConverter() {
  const [amount, setAmount] = useState("100");
  const [base, setBase] = useState<CurrencyCode>("CNY");
  const [quote, setQuote] = useState<CurrencyCode>("USD");
  const [data, setData] = useState<RateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  const loadRate = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/exchange-rates?base=${base}&quote=${quote}`, { signal, cache: "no-store" });
      const result = await response.json() as RateResponse;
      if (!response.ok || result.error) throw new Error(result.error || "汇率请求失败");
      setData(result);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "暂时无法取得汇率。");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [base, quote]);

  useEffect(() => {
    const controller = new AbortController();
    const loader = window.setTimeout(() => void loadRate(controller.signal), 0);
    return () => { window.clearTimeout(loader); controller.abort(); };
  }, [loadRate, refresh]);
  const numericAmount = Number(amount);
  const converted = useMemo(() => {
    try { return data ? convertCurrency(numericAmount, data.rate) : null; } catch { return null; }
  }, [numericAmount, data]);

  function swap() { setBase(quote); setQuote(base); setData((previous) => previous ? { ...previous, base: quote, quote: base, rate: 1 / previous.rate } : null); }

  return <UtilityShell title="实时汇率转换" description="使用最新机构参考汇率换算全球常用货币，并显示汇率日期。">
    <div className="currency-converter-layout">
      <section className="utility-panel utility-controls">
        <label>金额<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))} placeholder="输入金额" /></label>
        <div className="currency-pair">
          <label>从<select value={base} onChange={(event) => setBase(event.target.value as CurrencyCode)}>{currencies.map(([code, name]) => <option value={code} key={code}>{code} · {name}</option>)}</select></label>
          <button type="button" onClick={swap} aria-label="交换货币"><FiRepeat aria-hidden="true" /></button>
          <label>转换为<select value={quote} onChange={(event) => setQuote(event.target.value as CurrencyCode)}>{currencies.map(([code, name]) => <option value={code} key={code}>{code} · {name}</option>)}</select></label>
        </div>
        <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}><FiRefreshCw aria-hidden="true" />{loading ? "正在获取汇率…" : "刷新最新汇率"}</button>
      </section>
      <section className="utility-panel currency-result" aria-live="polite">
        <span>{base} → {quote}</span>
        <strong>{converted == null ? "—" : formatCurrencyAmount(converted, quote)}</strong>
        <p>{data ? `1 ${base} = ${data.rate.toLocaleString("zh-CN", { maximumFractionDigits: 8 })} ${quote}` : "正在加载汇率"}</p>
        <dl><div><dt>参考汇率日期</dt><dd>{data?.date || "—"}</dd></div><div><dt>本次获取时间</dt><dd>{data ? new Date(data.fetchedAt).toLocaleTimeString("zh-CN") : "—"}</dd></div></dl>
      </section>
    </div>
    {error ? <p className="utility-error" role="alert">{error}</p> : null}
    <p className="utility-muted currency-disclaimer">数据来自开源 Frankfurter API 汇总的央行和机构参考汇率，通常按交易日更新，不是可成交的高频外汇报价；实际结算请以银行或支付平台为准。</p>
  </UtilityShell>;
}
