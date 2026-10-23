"use client";
import { useState } from "react";
import { codecModes, type CodecMode } from "../lib/extra-tool-options";
import { runFileWorker } from "../lib/file-worker-client";
import { toolLimits } from "../lib/resource-limits";
import { useLocalTask, TaskFeedback } from "./local-workbench";
import { TextUtilityInput, TextUtilityResult } from "./text-utility-parts";
import { UtilityShell } from "./utility-shell";
export default function TextCodec() {
  const [text, setText] = useState("生活明朗，万物可爱。"), [mode, setMode] = useState<CodecMode>("base64");
  const task = useLocalTask<string>();
  return <UtilityShell className="additional-utilities" title="文本编码与解码" description="Base64、URL 参数、HTML 实体与 Unicode 转义，本地双向转换。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><label>编码方式<select value={mode} onChange={(e) => { task.reset(); setMode(e.target.value as CodecMode); }}>{codecModes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <p className="utility-muted">{codecModes.find((item) => item.id === mode)?.hint}</p>
      <TextUtilityInput text={text} limit={toolLimits.text.codecChars} onChange={(value) => { task.reset(); setText(value); }} />
      <div className="utility-actions">{(["encode", "decode"] as const).map((direction) => <button className={direction === "encode" ? "primary-button" : ""} key={direction} disabled={task.busy} onClick={() => void task.run((signal) => runFileWorker<string>({ action: "text-codec", text, mode, direction }, signal))}>{direction === "encode" ? "编码" : "解码"}</button>)}<button onClick={() => { task.reset(); setText(""); }}>清空</button></div><TaskFeedback task={task} />
    </section><section className="utility-panel"><h2>结果</h2>{task.result !== null ? <><TextUtilityResult key={task.result} text={task.result} name="encoded-text.txt" /><button type="button" onClick={() => { setText(task.result!); task.reset(); }}>结果移回输入</button></> : <p className="utility-muted">选择方式后点击编码或解码。不会执行 HTML 或脚本。</p>}</section></div>
  </UtilityShell>;
}
