"use client";
import { useState } from "react";
import type { XmlOptions, XmlResult } from "../lib/xml-formatter";
import { toolLimits } from "../lib/resource-limits";
import { runFileWorker } from "../lib/file-worker-client";
import { UtilityShell } from "./utility-shell";
import { TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityInput, TextUtilityResult } from "./text-utility-parts";

export default function XmlFormatter() {
  const [text, setText] = useState('<toolbox><name>多功能工具箱</name><tools count="2"><tool>GIF 帧提取</tool><tool>XML 格式化</tool></tools></toolbox>');
  const [mode, setMode] = useState<XmlOptions["mode"]>("format"), [indent, setIndent] = useState(2);
  const [reflow, setReflow] = useState(false);
  const task = useLocalTask<XmlResult>();
  return <UtilityShell className="additional-utilities" title="XML 格式化与校验" description="检查 XML 语法、整理缩进与属性，显示错误行列，支持复制和下载。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>XML 文档</h2>
      <TextUtilityInput text={text} accept=".xml,.svg,.txt,application/xml,text/xml,text/plain" limit={toolLimits.text.formatChars} label="XML 数据" onChange={(value) => { task.reset(); setText(value); }} />
      <div className="compact-options"><label>处理方式<select value={mode} onChange={(e) => { task.reset(); setMode(e.target.value as XmlOptions["mode"]); }}><option value="format">格式化</option><option value="validate">仅校验（保留原文）</option></select></label><label>缩进<select value={indent} disabled={mode !== "format"} onChange={(e) => { task.reset(); setIndent(Number(e.target.value)); }}><option value={2}>2 个空格</option><option value={4}>4 个空格</option></select></label></div>
      <label className="utility-checkbox"><input type="checkbox" checked={reflow} disabled={mode !== "format"} onChange={(e) => { task.reset(); setReflow(e.target.checked); }} />允许重排内容空白（可能改变文本含义）</label>
      <div className="utility-actions"><button type="button" className="primary-button" disabled={task.busy} onClick={() => void task.run((signal) => runFileWorker<XmlResult>({ action: "xml-process", text, options: { mode, indent, reflow } }, signal))}>处理 XML</button><button type="button" onClick={() => { task.reset(); setText(""); }}>清空</button></div>
      <TaskFeedback task={task} />
      <p className="utility-muted">只检查 XML 是否良构，不验证 XSD 或业务规则。不支持 DTD 与自定义实体，不执行脚本、样式表或请求外部资源；SVG 也只作为文本处理。</p>
      <p className="utility-muted">默认严格保留内容空白，所以紧凑文档不一定会展开为多行；明确允许重排后可整理缩进，但文本含义可能改变。仅接收 UTF-8 文档，签名文件请使用仅校验。文件仅在当前页面内存处理，不上传、不保存草稿。</p>
    </section><section className="utility-panel"><h2>处理结果</h2>{task.result ? <><p className="utility-muted" role="status">语法校验通过 · {task.result.elements} 个元素 · {task.result.attributes} 个属性 · 最深 {task.result.depth} 层{!task.result.changed ? " · 原文未改变" : ""}</p><TextUtilityResult key={task.result.output} text={task.result.output} name="document.xml" mime="application/xml;charset=utf-8" /></> : <p className="utility-muted">处理后在此预览 XML；长文档只截取预览，复制和下载保留完整结果。</p>}</section></div>
  </UtilityShell>;
}
