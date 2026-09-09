"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { UtilityShell } from "./utility-shell";

type KeySpec = { code: string; label: string; width?: number; gap?: boolean };
const key = (code: string, label: string, width?: number, gap?: boolean): KeySpec => ({ code, label, width, gap });
const rows: KeySpec[][] = [
  [key("Escape", "Esc", 1.4), key("F1", "F1", 1, true), key("F2", "F2"), key("F3", "F3"), key("F4", "F4"), key("F5", "F5", 1, true), key("F6", "F6"), key("F7", "F7"), key("F8", "F8"), key("F9", "F9", 1, true), key("F10", "F10"), key("F11", "F11"), key("F12", "F12")],
  [key("Backquote", "`"), ..."1234567890".split("").map((n) => key(`Digit${n}`, n)), key("Minus", "-"), key("Equal", "="), key("Backspace", "Backspace", 2)],
  [key("Tab", "Tab", 1.5), ..."QWERTYUIOP".split("").map((n) => key(`Key${n}`, n)), key("BracketLeft", "["), key("BracketRight", "]"), key("Backslash", "\\", 1.5)],
  [key("CapsLock", "Caps Lock", 1.8), ..."ASDFGHJKL".split("").map((n) => key(`Key${n}`, n)), key("Semicolon", ";"), key("Quote", "'"), key("Enter", "Enter", 2.2)],
  [key("ShiftLeft", "Shift", 2.3), ..."ZXCVBNM".split("").map((n) => key(`Key${n}`, n)), key("Comma", ","), key("Period", "."), key("Slash", "/"), key("ShiftRight", "Shift", 2.7)],
  [key("ControlLeft", "Ctrl", 1.4), key("MetaLeft", "Win", 1.4), key("AltLeft", "Alt", 1.4), key("Space", "Space", 6), key("AltRight", "Alt", 1.4), key("ControlRight", "Ctrl", 1.4), key("ArrowLeft", "←", 1, true), key("ArrowUp", "↑"), key("ArrowDown", "↓"), key("ArrowRight", "→")],
];
const totalKeys = new Set(rows.flat().map((item) => item.code)).size;
type KeyEventInfo = { code: string; key: string; time: string; repeat: boolean };

export default function KeyboardTester() {
  const [active, setActive] = useState(false);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [tested, setTested] = useState<Set<string>>(new Set());
  const [maximum, setMaximum] = useState(0);
  const [events, setEvents] = useState<KeyEventInfo[]>([]);
  const last = events[0];

  useEffect(() => {
    if (!active) return;
    const down = (event: KeyboardEvent) => {
      event.preventDefault();
      const now = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      setPressed((current) => { const next = new Set(current); next.add(event.code); setMaximum((value) => Math.max(value, next.size)); return next; });
      setTested((current) => new Set(current).add(event.code));
      setEvents((current) => [{ code: event.code || "Unidentified", key: event.key, repeat: event.repeat, time: now }, ...current].slice(0, 8));
      if (event.key === "Escape") setActive(false);
    };
    const up = (event: KeyboardEvent) => { event.preventDefault(); setPressed((current) => { const next = new Set(current); next.delete(event.code); return next; }); };
    const release = () => setPressed(new Set());
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", release);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", release); setPressed(new Set()); };
  }, [active]);

  const progress = useMemo(() => Math.round((rows.flat().filter((item) => tested.has(item.code)).length / totalKeys) * 100), [tested]);
  function reset() { setTested(new Set()); setPressed(new Set()); setMaximum(0); setEvents([]); }

  return <UtilityShell title="键盘按键测试" description="实时检测按键触发、长按重复和多键同时按下情况。">
    <div className="keyboard-test-layout">
      <div className="utility-panel keyboard-status-panel">
        <div className="keyboard-stats"><span><strong>{tested.size}</strong> 已检测按键</span><span><strong>{pressed.size}</strong> 当前按下</span><span><strong>{maximum}</strong> 最大同时按下</span><span><strong>{progress}%</strong> 布局进度</span></div>
        <div className="keyboard-actions"><button type="button" className="primary-button" onClick={() => setActive((value) => !value)}>{active ? "停止键盘测试" : "开始键盘测试"}</button><button type="button" onClick={reset}>重置记录</button></div>
        <p className={`keyboard-listening${active ? " is-active" : ""}`} role="status">{active ? "正在监听：请按下键盘按键，按 Esc 停止测试。" : "点击“开始键盘测试”后再按键。"}</p>
      </div>
      <div className="utility-panel keyboard-board-panel" aria-label="虚拟键盘">
        <div className="keyboard-board">{rows.map((row, rowIndex) => <div className="keyboard-row" key={rowIndex}>{row.map((item) => <div key={item.code} className={`keyboard-key${pressed.has(item.code) ? " is-pressed" : ""}${tested.has(item.code) ? " is-tested" : ""}${item.gap ? " has-gap" : ""}`} style={{ "--key-width": item.width ?? 1 } as CSSProperties}><strong>{item.label}</strong><small>{item.code}</small></div>)}</div>)}</div>
        <p className="utility-muted">绿色表示已检测，紫色表示正在按下。浏览器通常无法识别 Fn、部分媒体键和厂商自定义宏键。</p>
      </div>
      <div className="utility-panel keyboard-event-panel">
        <div className="utility-heading"><h2>最近按键事件</h2><span className="utility-muted">KeyboardEvent</span></div>
        {last ? <div className="keyboard-last"><span>显示字符<strong>{last.key === " " ? "Space" : last.key}</strong></span><span>物理位置<strong>{last.code}</strong></span><span>长按重复<strong>{last.repeat ? "是" : "否"}</strong></span></div> : <p className="utility-muted">开始测试后，这里会显示浏览器接收到的按键名称与物理位置。</p>}
        {events.length ? <ol className="keyboard-event-list">{events.map((event, index) => <li key={`${event.time}-${index}`}><time>{event.time}</time><strong>{event.code}</strong><span>{event.key === " " ? "Space" : event.key}</span>{event.repeat ? <em>重复</em> : null}</li>)}</ol> : null}
      </div>
    </div>
  </UtilityShell>;
}
