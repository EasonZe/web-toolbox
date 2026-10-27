"use client";
import { useState } from "react";
import type { PointerResult } from "../lib/json-pointer";
import { toolLimits } from "../lib/resource-limits";
import { runFileWorker } from "../lib/file-worker-client";
import { UtilityShell } from "./utility-shell";
import { TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityInput, TextUtilityResult } from "./text-utility-parts";

export default function JsonPointer() {
  const [text, setText] = useState('{\n  "users": [{"name": "Eason", "active": true}],\n  "total": 9007199254740993\n}');
  const [paths, setPaths] = useState("/users/0/name\n/total");
  const task = useLocalTask<PointerResult>();
  return <UtilityShell className="additional-utilities" title="JSON 路径提取" description="按 JSON Pointer 路径批量提取对象字段或数组元素，保留原始数字和数据类型。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>JSON 与路径</h2>
      <TextUtilityInput text={text} accept=".json,.txt,application/json,text/plain" limit={toolLimits.text.jsonChars} onChange={(value) => { task.reset(); setText(value); }} label="JSON 数据" />
      <label>提取路径（每行一个）<textarea aria-label="提取路径" rows={6} value={paths} maxLength={toolLimits.jsonPointer.chars} spellCheck={false} onChange={(e) => { task.reset(); setPaths(e.target.value); }} /></label>
      <div className="utility-actions"><button type="button" className="primary-button" disabled={task.busy} onClick={() => void task.run((signal) => runFileWorker<PointerResult>({ action: "json-pointer", text, paths }, signal))}>提取数据</button><button type="button" onClick={() => { task.reset(); setPaths("#"); }}>整个文档</button><button type="button" onClick={() => { task.reset(); setText(""); setPaths(""); }}>清空</button></div>
      <TaskFeedback task={task} />
      <p className="utility-muted">采用 RFC 6901，不是 JSONPath 或 JavaScript 表达式，不执行脚本。/users/0/name 访问数组首项；# 代表整个文档，/ 访问空名称字段；字段中的 / 写成 ~1，~ 写成 ~0，也可使用 #/ 开头的 URI 片段。</p>
      <p className="utility-muted">一次最多 200 个路径，保留路径首尾空格，忽略空行。未找到以 found: false 标记；null、false 和 0 都是有效结果。拒绝重复字段，不改动或上传输入，不存储草稿。</p>
    </section><section className="utility-panel"><h2>提取结果</h2>{task.result ? <><p className="utility-muted" role="status">找到 {task.result.matched} / {task.result.total} 个路径；结果包含路径、是否找到与原始值。</p><TextUtilityResult key={task.result.output} text={task.result.output} name="json-extracted.json" mime="application/json" /></> : <p className="utility-muted">点击提取后预览、复制或下载 JSON。长整数直接从原文取值，不转为浮点数。</p>}</section></div>
  </UtilityShell>;
}
