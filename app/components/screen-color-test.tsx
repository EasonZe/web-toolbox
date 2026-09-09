"use client";

import { useEffect, useRef, useState } from "react";
import { UtilityShell } from "./utility-shell";

const presets = [
  { name: "白色", value: "#FFFFFF" }, { name: "黑色", value: "#000000" },
  { name: "红色", value: "#FF0000" }, { name: "绿色", value: "#00FF00" },
  { name: "蓝色", value: "#0000FF" }, { name: "青色", value: "#00FFFF" },
  { name: "洋红", value: "#FF00FF" }, { name: "黄色", value: "#FFFF00" },
  { name: "50% 灰", value: "#808080" }, { name: "25% 灰", value: "#C0C0C0" },
];

function textColor(background: string) {
  const rgb = background.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? [255, 255, 255];
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 150 ? "#111827" : "#FFFFFF";
}

export default function ScreenColorTest() {
  const [index, setIndex] = useState(0);
  const [customColor, setCustomColor] = useState("#7C6FA7");
  const [customInput, setCustomInput] = useState("#7C6FA7");
  const [useCustom, setUseCustom] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const fullRef = useRef<HTMLDivElement>(null);
  const color = useCustom ? customColor : presets[index].value;
  const name = useCustom ? "自定义颜色" : presets[index].name;

  useEffect(() => {
    const onFullscreen = () => setRunning(document.fullscreenElement === fullRef.current);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    if (!running) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " " || event.key === "Enter") { event.preventDefault(); setUseCustom(false); setIndex((value) => (value + 1) % presets.length); }
      if (event.key === "ArrowLeft") { event.preventDefault(); setUseCustom(false); setIndex((value) => (value - 1 + presets.length) % presets.length); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [running]);

  async function start() {
    try { await fullRef.current?.requestFullscreen(); setMessage(""); }
    catch { setMessage("浏览器未能进入全屏，请允许全屏后重试。"); }
  }

  function next() { setUseCustom(false); setIndex((value) => (value + 1) % presets.length); }

  return <UtilityShell title="屏幕纯色测试" description="全屏显示纯色，检查坏点、亮点、色偏和背光均匀度。">
    <div className="utility-columns screen-test-columns">
      <div className="utility-panel utility-controls">
        <h2>测试颜色</h2>
        <div className="screen-color-grid">{presets.map((preset, presetIndex) => <button type="button" key={preset.value} className={!useCustom && index === presetIndex ? "is-selected" : ""} aria-pressed={!useCustom && index === presetIndex} onClick={() => { setUseCustom(false); setIndex(presetIndex); }}><i style={{ background: preset.value }} /><span>{preset.name}</span><small>{preset.value}</small></button>)}</div>
        <label>自定义颜色<div className="screen-custom-color"><input aria-label="自定义测试颜色" type="color" value={customColor} onChange={(event) => { const value = event.target.value.toUpperCase(); setCustomColor(value); setCustomInput(value); setUseCustom(true); }} /><input aria-label="自定义颜色 HEX" value={customInput} maxLength={7} onBlur={() => setCustomInput(customColor)} onChange={(event) => { const value = event.target.value.toUpperCase(); setCustomInput(value); if (/^#[0-9A-F]{6}$/.test(value)) { setCustomColor(value); setUseCustom(true); } }} /></div></label>
        <button type="button" className="primary-button" onClick={() => void start()}>开始全屏测试</button>
        {message ? <p role="status">{message}</p> : null}
      </div>
      <div className="utility-panel screen-instructions">
        <div className="utility-heading"><h2>当前颜色</h2><strong>{name} · {color}</strong></div>
        <div className="screen-color-preview" style={{ background: color, color: textColor(color) }}><span>{name}</span></div>
        <ol><li>进入全屏后仔细查看颜色中是否存在异常亮点或暗点。</li><li>点击屏幕、按空格或 → 切换下一种颜色，按 ← 返回。</li><li>黑色适合检查漏光与亮点，白色和灰色适合检查暗点与色彩均匀度。</li><li>按 Esc 随时退出全屏测试。</li></ol>
      </div>
    </div>
    <div ref={fullRef} className="screen-fullscreen" style={{ background: color, color: textColor(color) }} onClick={next} role="button" tabIndex={running ? 0 : -1} aria-label={`全屏测试颜色：${name}`}>
      {running ? <div className="screen-overlay-hint"><strong>{name}</strong><span>{index + 1} / {presets.length} · 点击或空格切换 · Esc 退出</span></div> : null}
    </div>
  </UtilityShell>;
}
