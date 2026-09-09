"use client";

import { useEffect, useRef, useState } from "react";
import { FiMaximize, FiPlus, FiRefreshCw, FiX } from "react-icons/fi";
import { UtilityShell } from "./utility-shell";
import { formatZonedTime, popularTimeZones } from "../lib/world-time";

const labels = new Map<string, string>(popularTimeZones);

function allTimeZones() {
  const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf?.("timeZone") ?? [];
  return [...new Set([...[...popularTimeZones].map(([zone]) => zone), ...supported])].sort((a, b) => a.localeCompare(b));
}

function displayZone(zone: string) { return labels.get(zone) || zone.replaceAll("_", " "); }

export default function WorldClock() {
  const [zones, setZones] = useState(["Asia/Shanghai", "Europe/London", "America/New_York", "Asia/Tokyo"]);
  const [selected, setSelected] = useState("Asia/Shanghai");
  const [fullscreenZone, setFullscreenZone] = useState("Asia/Shanghai");
  const [now, setNow] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [syncLabel, setSyncLabel] = useState("正在校准…");
  const [availableZones, setAvailableZones] = useState<string[]>(() => popularTimeZones.map(([zone]) => zone));
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const adjustedNow = new Date(now + serverOffset);

  async function syncClock() {
    const sent = Date.now();
    try {
      const response = await fetch(`/api/time?t=${sent}`, { cache: "no-store" });
      const data = await response.json() as { serverTime: number };
      const received = Date.now();
      if (!response.ok || !Number.isFinite(data.serverTime)) throw new Error();
      setServerOffset(data.serverTime - Math.round((sent + received) / 2));
      setSyncLabel(`已校准 · 网络往返 ${received - sent}ms`);
    } catch { setServerOffset(0); setSyncLabel("使用设备时间"); }
  }

  useEffect(() => {
    const initializer = window.setTimeout(() => {
      const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (localZone) setZones((value) => [...new Set([localZone, ...value])]);
      setAvailableZones(allTimeZones());
      setNow(Date.now());
      void syncClock();
    }, 0);
    const ticker = window.setInterval(() => setNow(Date.now()), 250);
    const synchronizer = window.setInterval(() => void syncClock(), 5 * 60_000);
    return () => { window.clearTimeout(initializer); window.clearInterval(ticker); window.clearInterval(synchronizer); };
  }, []);

  async function showFullscreen(zone: string) {
    setFullscreenZone(zone);
    window.setTimeout(() => void fullscreenRef.current?.requestFullscreen(), 0);
  }
  function addZone() { if (!zones.includes(selected)) setZones((value) => [...value, selected]); }

  const fullscreenTime = formatZonedTime(adjustedNow, fullscreenZone);
  return <UtilityShell title="全球实时时间" description="查看全球IANA时区时间，精确到秒，并可全屏显示任意一个时间。">
    <section className="utility-panel world-clock-toolbar">
      <label>选择时区<select value={selected} onChange={(event) => setSelected(event.target.value)}>{availableZones.map((zone) => <option value={zone} key={zone}>{displayZone(zone)} · {zone}</option>)}</select></label>
      <button className="primary-button" type="button" onClick={addZone} disabled={zones.includes(selected)}><FiPlus aria-hidden="true" />添加时钟</button>
      <button type="button" onClick={() => void syncClock()}><FiRefreshCw aria-hidden="true" />重新校准</button>
      <span className="utility-muted">{syncLabel}</span>
    </section>
    <div className="world-clock-grid">
      {zones.map((zone) => {
        const value = formatZonedTime(adjustedNow, zone);
        return <article className="utility-panel world-clock-card" key={zone}>
          <div><span>{displayZone(zone)}</span><small>{zone} · {value.zoneName}</small></div>
          <time dateTime={adjustedNow.toISOString()}>{value.time}</time>
          <p>{value.date}</p>
          <div className="utility-actions"><button type="button" onClick={() => void showFullscreen(zone)}><FiMaximize aria-hidden="true" />全屏</button><button type="button" aria-label={`移除 ${displayZone(zone)}`} disabled={zones.length === 1} onClick={() => setZones((value) => value.filter((item) => item !== zone))}><FiX aria-hidden="true" />移除</button></div>
        </article>;
      })}
    </div>
    <div ref={fullscreenRef} className="world-clock-fullscreen">
      <span>{displayZone(fullscreenZone)}</span><time>{fullscreenTime.time}</time><p>{fullscreenTime.date}</p><small>{fullscreenZone} · {fullscreenTime.zoneName}</small>
    </div>
  </UtilityShell>;
}
