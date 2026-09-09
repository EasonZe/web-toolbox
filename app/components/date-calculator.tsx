"use client";

import { useMemo, useState } from "react";
import { calculateDateDifference, shiftDate, type DateOffset } from "../lib/date-calculator";
import { UtilityShell } from "./utility-shell";

const units: { key: keyof DateOffset; label: string }[] = [{ key: "years", label: "年" }, { key: "months", label: "月" }, { key: "weeks", label: "周" }, { key: "days", label: "天" }];

function dateInChina() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

const initialToday = dateInChina();
const initialEnd = addCalendarDays(initialToday, 30);

function durationText(duration: ReturnType<typeof calculateDateDifference>["duration"]) {
  const parts = [[duration.years, "年"], [duration.months, "个月"], [duration.days, "天"]].filter(([value]) => value) as [number, string][];
  return parts.length ? parts.map(([value, unit]) => `${value}${unit}`).join(" ") : "同一天";
}

export default function DateCalculator() {
  const [mode, setMode] = useState<"difference" | "shift">("difference");
  const [start, setStart] = useState(initialToday);
  const [end, setEnd] = useState(initialEnd);
  const [inclusive, setInclusive] = useState(false);
  const [source, setSource] = useState(initialToday);
  const [direction, setDirection] = useState<"add" | "subtract">("add");
  const [offset, setOffset] = useState<DateOffset>({ years: 0, months: 0, weeks: 0, days: 30 });
  const difference = useMemo(() => { try { return calculateDateDifference(start, end, inclusive); } catch { return null; } }, [start, end, inclusive]);
  const shifted = useMemo(() => { try { return shiftDate(source, offset, direction); } catch { return null; } }, [source, offset, direction]);

  return <UtilityShell title="日期计算器" description="计算两个日期的间隔，或按年、月、周、天推算目标日期。">
    <div className="date-calculator-layout">
      <div className="mode-tabs" role="tablist" aria-label="日期计算模式"><button type="button" role="tab" aria-selected={mode === "difference"} onClick={() => setMode("difference")}>日期间隔</button><button type="button" role="tab" aria-selected={mode === "shift"} onClick={() => setMode("shift")}>日期加减</button></div>
      {mode === "difference" ? <div className="utility-columns">
        <div className="utility-panel utility-controls">
          <h2>选择日期</h2>
          <label>开始日期<input aria-label="开始日期" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label>结束日期<input aria-label="结束日期" type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
          <label className="utility-checkbox"><input type="checkbox" checked={inclusive} onChange={(event) => setInclusive(event.target.checked)} />包含开始日和结束日</label>
          <div className="utility-actions"><button type="button" onClick={() => { setStart(end); setEnd(start); }}>交换日期</button><button type="button" onClick={() => setStart(dateInChina())}>开始日设为今天</button></div>
        </div>
        <div className="utility-panel">
          <div className="utility-heading"><h2>间隔结果</h2><span className="utility-muted">按自然日计算</span></div>
          {difference ? <><div className="date-result-primary"><strong>{difference.days}</strong><span>天</span></div><div className="date-result-grid"><span><strong>{Math.abs(difference.weeks)}</strong> 整周 + {difference.remainingDays} 天</span><span><strong>{difference.months}</strong> 整月</span><span><strong>{difference.years}</strong> 整年</span><span><strong>{difference.weekdays}</strong> 工作日</span></div><p className="utility-muted">日历间隔：{durationText(difference.duration)}。工作日仅排除周六、周日，不包含法定节假日调休。</p></> : <p className="utility-muted">请选择两个有效日期。</p>}
        </div>
      </div> : <div className="utility-columns">
        <div className="utility-panel utility-controls">
          <h2>日期加减</h2>
          <label>起始日期<input aria-label="推算起始日期" type="date" value={source} onChange={(event) => setSource(event.target.value)} /></label>
          <div className="mode-tabs compact" role="tablist" aria-label="加减方向"><button type="button" role="tab" aria-selected={direction === "add"} onClick={() => setDirection("add")}>加上时间</button><button type="button" role="tab" aria-selected={direction === "subtract"} onClick={() => setDirection("subtract")}>减去时间</button></div>
          <div className="date-offset-grid">{units.map((unit) => <label key={unit.key}>{unit.label}<input type="number" min="0" max="9999" aria-label={`偏移${unit.label}`} value={offset[unit.key]} onChange={(event) => setOffset((current) => ({ ...current, [unit.key]: Math.max(0, Math.min(9999, Number(event.target.value) || 0)) }))} /></label>)}</div>
          <div className="utility-actions"><button type="button" onClick={() => setSource(dateInChina())}>设为今天</button><button type="button" onClick={() => setOffset({ years: 0, months: 0, weeks: 0, days: 0 })}>清空偏移</button></div>
        </div>
        <div className="utility-panel date-shift-result">
          <div className="utility-heading"><h2>目标日期</h2><span className="utility-muted">自动计算</span></div>
          {shifted ? <><strong className="date-target">{shifted.value}</strong><span className="date-weekday">{shifted.weekday}</span><div className="date-result-grid"><span>本年第 <strong>{shifted.dayOfYear}</strong> 天</span><span>ISO 第 <strong>{shifted.week}</strong> 周</span><span><strong>{shifted.leapYear ? "闰年" : "平年"}</strong></span></div></> : <p className="utility-muted">请选择有效日期。</p>}
        </div>
      </div>}
    </div>
  </UtilityShell>;
}
