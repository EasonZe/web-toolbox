"use client";
import { useEffect, useRef, useState } from "react";
import { startPromptScroll } from "../lib/teleprompter";
import { toolLimits } from "../lib/resource-limits";
import { UtilityShell } from "./utility-shell";
import { TextUtilityInput, TextUtilityResult } from "./text-utility-parts";
export default function Teleprompter() {
  const [text, setText] = useState("生活明朗，万物可爱。\n\n欢迎使用本地提词器。请在这里填入你的稿件，调整字号和滚动速度，然后开始朗读。\n\n放慢一点，保持自然的节奏。"), [speed, setSpeed] = useState(40), [size, setSize] = useState(40), [running, setRunning] = useState(false), [mirror, setMirror] = useState(false), [message, setMessage] = useState(""), [full, setFull] = useState(false);
  const player = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!running) return;
    const stop = startPromptScroll({ speed, read: () => ({ position: Math.max(0, scroller.current?.scrollTop ?? 0), maximum: Math.max(0, (scroller.current?.scrollHeight ?? 0) - (scroller.current?.clientHeight ?? 0)) }), write: (value) => { if (scroller.current) scroller.current.scrollTop = value; }, end: () => { setRunning(false); setMessage("已到稿件末尾。"); } });
    const visibility = () => { if (document.hidden) { setRunning(false); setMessage("页面转入后台，已暂停。"); } }; document.addEventListener("visibilitychange", visibility);
    return () => { stop(); document.removeEventListener("visibilitychange", visibility); };
  }, [running, speed]);
  useEffect(() => { const changed = () => setFull(document.fullscreenElement === player.current); document.addEventListener("fullscreenchange", changed); return () => document.removeEventListener("fullscreenchange", changed); }, []);
  function reset() { setRunning(false); if (scroller.current) scroller.current.scrollTop = 0; setMessage(""); }
  async function fullscreen() { try { if (document.fullscreenElement === player.current) await document.exitFullscreen(); else if (player.current?.requestFullscreen) await player.current.requestFullscreen(); else throw new Error("当前浏览器不支持元素全屏，可使用浏览器自身全屏功能。"); } catch (cause) { setMessage((cause as Error).message); } }
  return <UtilityShell className="additional-utilities" title="提词器" description="本地稿件自动滚动，支持暂停、速度、字号、镜像与全屏；不自动保存或上传稿件。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>稿件与设置</h2><TextUtilityInput label="朗读稿件" text={text} limit={toolLimits.practice.promptChars} onChange={(value) => { reset(); setText(value); }} />
      <label className="utility-range-control"><span>滚动速度<output>{speed} px/s</output></span><input type="range" min="5" max="200" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label><label className="utility-range-control"><span>阅读字号<output>{size}px</output></span><input type="range" min="20" max="96" value={size} onChange={(e) => { setRunning(false); setSize(Number(e.target.value)); }} /></label>
      <label className="utility-checkbox"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />水平镜像（用于提词镜）</label>
      <p className="utility-muted">滚动速度按像素 / 秒，不等同字 / 分。手动滚动后从当前位置继续；页面转入后台自动暂停。播放器聚焦时，空格切换播放、↑ / ↓ 调速、Home 回到开头；输入框中不拦截快捷键。稿件清空或改动会暂停并回到开头。</p>
      <details><summary>复制或下载稿件</summary><TextUtilityResult text={text} name="prompter.txt" /></details>
    </section><section className="utility-panel"><h2>朗读窗口</h2><div className="teleprompter-player" ref={player} tabIndex={0} role="region" aria-label="提词器播放器" onKeyDown={(e) => {
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === " " && text.trim()) { e.preventDefault(); setRunning((v) => !v); } else if (e.key === "ArrowUp") { e.preventDefault(); setSpeed((v) => Math.min(200, v + 5)); } else if (e.key === "ArrowDown") { e.preventDefault(); setSpeed((v) => Math.max(5, v - 5)); } else if (e.key === "Home") { e.preventDefault(); reset(); }
    }}><div className="teleprompter-controls"><button type="button" disabled={!text.trim()} onClick={() => { setMessage(""); setRunning(!running); }}>{running ? "暂停" : "开始朗读"}</button><button type="button" onClick={reset}>回到开头</button><button type="button" onClick={() => void fullscreen()}>{full ? "退出全屏" : "全屏朗读"}</button><span>{speed} px/s</span></div>
      <div className="teleprompter-stage"><div className="teleprompter-scroll" ref={scroller}><div className="teleprompter-text" style={{ fontSize: size, transform: mirror ? "scaleX(-1)" : undefined }}>{text || "请先输入稿件"}</div></div><div className="teleprompter-guide" aria-hidden="true" /></div>
      <p className="teleprompter-message" role="status">{message || (running ? "正在滚动" : "已暂停")}</p>
    </div></section></div>
  </UtilityShell>;
}
