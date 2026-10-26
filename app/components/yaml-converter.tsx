"use client";
import { useState } from "react";
import type { YamlDirection } from "../lib/yaml-conversion";
import { runFileWorker } from "../lib/file-worker-client";
import { toolLimits } from "../lib/resource-limits";
import { TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityInput, TextUtilityResult } from "./text-utility-parts";
import { UtilityShell } from "./utility-shell";
export default function YamlConverter() {
  const [text, setText] = useState('name: 多功能工具箱\nfeatures:\n  - 图片\n  - 文档\nenabled: true\n'), [direction, setDirection] = useState<YamlDirection>("yaml-to-json"), [indent, setIndent] = useState(2);
  const task = useLocalTask<string>();
  return <UtilityShell className="additional-utilities" title="YAML / JSON 互转" description="本地转换配置文件，严格检查重复字段、类型、别名与嵌套，支持错误定位。">
    <div className="utility-columns"><section className="utility-panel utility-controls">
      <label>转换方向<select value={direction} onChange={(e) => { task.reset(); setDirection(e.target.value as YamlDirection); }}><option value="yaml-to-json">YAML → JSON</option><option value="json-to-yaml">JSON → YAML</option></select></label>
      <label>缩进<select value={indent} onChange={(e) => { task.reset(); setIndent(Number(e.target.value)); }}><option value="2">2 空格</option><option value="4">4 空格</option></select></label>
      <TextUtilityInput text={text} accept=".yaml,.yml,.json,.txt,text/*,application/json" limit={toolLimits.text.jsonChars} onChange={(value) => { task.reset(); setText(value); }} />
      <button type="button" className="primary-button" disabled={task.busy} onClick={() => void task.run((signal) => runFileWorker<string>({ action: "yaml-convert", text, direction, indent }, signal))}>转换配置</button><TaskFeedback task={task} />
      <p className="utility-muted">采用 YAML 1.2 Core，单文档转换。JSON 不保留注释、锚点和原排版；不支持自定义标签、循环引用和非有限数。超出安全范围的整数请写成字符串。常规小数遵循 JavaScript 数值精度。</p>
    </section><section className="utility-panel"><h2>转换结果</h2>{task.result !== null ? <><TextUtilityResult text={task.result} name={direction === "yaml-to-json" ? "config.json" : "config.yaml"} mime={direction === "yaml-to-json" ? "application/json" : "application/yaml"} />
      <button type="button" onClick={() => { setText(task.result!); setDirection(direction === "yaml-to-json" ? "json-to-yaml" : "yaml-to-json"); task.reset(); }}>结果移回输入并反向转换</button>
    </> : <p className="utility-muted">选择方向并开始转换；配置内容不会上传或自动保存。</p>}</section></div>
  </UtilityShell>;
}
