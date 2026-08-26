"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  FiCheck,
  FiClock,
  FiCopy,
  FiGlobe,
  FiMapPin,
  FiNavigation,
  FiRefreshCw,
  FiSearch,
  FiWifi,
} from "react-icons/fi";

type IpData = {
  ip: string;
  type: string;
  flag: string;
  continent: string;
  continentCode: string;
  country: string;
  countryCode: string;
  region: string;
  regionCode: string;
  city: string;
  postal: string;
  latitude: number | null;
  longitude: number | null;
  asn: number | null;
  organization: string;
  isp: string;
  domain: string;
  timezone: string;
  timezoneAbbr: string;
  utcOffset: string;
  daylightSaving: boolean;
};

type ApiResponse =
  | { success: true; data: IpData }
  | { success: false; error: string };

type ResultItem = {
  label: string;
  value: string;
  icon: typeof FiGlobe;
};

const emptyResultLabels = [
  "国家 / 地区",
  "省份与城市",
  "运营商",
  "组织",
  "ASN",
  "时区",
  "经纬度",
  "邮政编码",
];

export default function IpLookup() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<IpData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [lastLookupIp, setLastLookupIp] = useState("");

  async function lookup(ip = "") {
    setLastLookupIp(ip);
    setLoading(true);
    setMessage("");
    setCopied(false);
    try {
      const endpoint = ip ? `/api/ip?ip=${encodeURIComponent(ip)}` : "/api/ip";
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.success ? "查询失败。" : payload.error);
      }
      setResult(payload.data);
    } catch (error) {
      setResult(null);
      setMessage(error instanceof Error ? error.message : "查询失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lookup(query.trim());
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void lookup(), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function copyIp() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.ip);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage("复制失败，请手动选择 IP 地址复制。");
    }
  }

  function refreshResult() {
    void lookup(lastLookupIp);
  }

  const location = result
    ? [result.country, result.region, result.city]
        .filter((value, index, values) => value !== "—" && values.indexOf(value) === index)
        .join(" · ") || "—"
    : "—";
  const coordinates = result?.latitude != null && result.longitude != null
    ? `${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}`
    : "—";
  const resultItems: ResultItem[] = result
    ? [
        { label: "国家 / 地区", value: `${result.flag} ${result.country}${result.countryCode ? ` (${result.countryCode})` : ""}`.trim(), icon: FiGlobe },
        { label: "省份与城市", value: [result.region, result.city].filter((item) => item !== "—").join(" · ") || "—", icon: FiMapPin },
        { label: "运营商", value: result.isp, icon: FiWifi },
        { label: "组织", value: result.organization, icon: FiGlobe },
        { label: "ASN", value: result.asn == null ? "—" : `AS${result.asn}`, icon: FiWifi },
        { label: "时区", value: `${result.timezone} · UTC${result.utcOffset}${result.timezoneAbbr ? ` · ${result.timezoneAbbr}` : ""}`, icon: FiClock },
        { label: "经纬度", value: coordinates, icon: FiNavigation },
        { label: "邮政编码", value: result.postal, icon: FiMapPin },
      ]
    : [];

  return (
    <main className="tool-shell ip-lookup-shell">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> Eason的工具箱
      </Link>

      <header className="tool-header ip-lookup-header">
        <h1>IP地址查询工具</h1>
        <p>查询公网 IPv4 或 IPv6 的大致位置、运营商、ASN 与时区信息。</p>
      </header>

      <section className="converter-card ip-lookup-card" aria-label="IP地址查询" aria-busy={loading}>
        <form className="ip-lookup-form" onSubmit={handleSubmit}>
          <label htmlFor="ip-address">IP 地址</label>
          <div className="ip-lookup-input-row">
            <input
              id="ip-address"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入 IPv4 或 IPv6，例如 8.8.8.8"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
            />
            <button className="convert-button ip-lookup-submit" type="submit" disabled={loading}>
              <FiSearch aria-hidden="true" />
              {loading ? "正在查询…" : "查询 IP"}
            </button>
          </div>
          <button className="ip-lookup-self" type="button" onClick={() => { setQuery(""); void lookup(); }} disabled={loading}>
            查询我的公网 IP
          </button>
        </form>

        {message ? <p className="message" role="alert">{message}</p> : null}

        <section className="ip-lookup-result" aria-labelledby="ip-result-title">
          <div className="ip-result-hero">
            <div>
              <span id="ip-result-title">查询结果</span>
              <strong>{result?.ip ?? (loading ? "正在获取…" : "等待查询")}</strong>
              <small>{result ? `${result.type} · ${location}` : "输入 IP 地址或查询当前公网 IP"}</small>
            </div>
            <div className="ip-result-actions">
              <button
                className={loading ? "ip-result-refresh is-loading" : "ip-result-refresh"}
                type="button"
                onClick={refreshResult}
                disabled={!result || loading}
                aria-label="刷新查询结果"
              >
                <FiRefreshCw aria-hidden="true" />
                刷新
              </button>
              <button type="button" onClick={copyIp} disabled={!result || loading} aria-label="复制 IP 地址">
                {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                {copied ? "已复制" : "复制"}
              </button>
            </div>
          </div>

          <div className="ip-result-grid">
            {result ? resultItems.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.label}>
                  <Icon aria-hidden="true" />
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                </article>
              );
            }) : emptyResultLabels.map((label) => (
              <article className="is-empty" key={label} aria-hidden="true">
                <FiGlobe />
                <div><span>{label}</span><strong>—</strong></div>
              </article>
            ))}
          </div>
        </section>

        <p className="ip-lookup-note">IP 定位通常只能精确到城市或网络节点，不能用于判断具体住址。查询数据由第三方 IP 数据服务提供。</p>
      </section>
    </main>
  );
}
