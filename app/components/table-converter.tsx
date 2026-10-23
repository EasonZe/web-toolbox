"use client";
import { useState } from "react";
import type { TableOptions, TableResult } from "../lib/table-conversion";
import { runFileWorker } from "../lib/file-worker-client";
import { toolLimits } from "../lib/resource-limits";
import { TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityInput, TextUtilityResult } from "./text-utility-parts";
import { UtilityShell } from "./utility-shell";
export default function TableConverter() {
  const [text, setText] = useState('姓名,编号,城市\r\nEason,001,上海\r\n小明,002,北京');
  const [options, setOptions] = useState<TableOptions>({ input: "csv", output: "json", header: true, safeFormulae: true, bom: true });
  const task = useLocalTask<TableResult>();
  function change(next: Partial<TableOptions>) { task.reset(); setOptions({ ...options, ...next }); }
  return <UtilityShell className="additional-utilities" title="CSV / JSON 表格转换" description="CSV、TSV 与 JSON 双向转换，支持中文、引号、换行和表格预览。">
    <div className="utility-columns"><section className="utility-panel utility-controls">
      <div className="utility-columns table-format-options">{(["input", "output"] as const).map((key) => <label key={key}>{key === "input" ? "输入格式" : "输出格式"}<select value={options[key]} onChange={(e) => change({ [key]: e.target.value })}>{["csv", "tsv", "json"].map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>)}</div>
      <fieldset className="compact-options"><legend>转换选项</legend><label className="utility-checkbox"><input type="checkbox" disabled={options.input === "json"} checked={options.header} onChange={(e) => change({ header: e.target.checked })} />CSV / TSV 首行为表头</label>
        <label className="utility-checkbox"><input type="checkbox" disabled={options.output === "json"} checked={options.safeFormulae} onChange={(e) => change({ safeFormulae: e.target.checked })} />防止表格软件执行公式</label>
        <label className="utility-checkbox"><input type="checkbox" disabled={options.output === "json"} checked={options.bom} onChange={(e) => change({ bom: e.target.checked })} />CSV / TSV 添加 UTF-8 BOM</label></fieldset>
      <TextUtilityInput text={text} label="输入数据" accept=".csv,.tsv,.json,.txt,text/*,application/json" limit={toolLimits.text.jsonChars} onChange={(value) => { task.reset(); setText(value); }} />
      <button type="button" className="primary-button" disabled={task.busy} onClick={() => void task.run((signal) => runFileWorker<TableResult>({ action: "table-convert", text, options }, signal))}>转换表格</button><TaskFeedback task={task} />
      <p className="utility-muted">CSV 单元格保留为字符串，避免长编号和前导零丢失。JSON 支持对象数组、等宽二维数组；不支持嵌套对象。公式保护会给危险文本加单引号，关闭后请勿在表格软件中打开不可信数据。</p>
    </section><section className="utility-panel"><h2>转换结果</h2>{task.result ? <><p className="utility-muted">{task.result.rows.toLocaleString()} 条数据 · {task.result.columns} 列{task.result.protectedCells > 0 && ` · 已保护 ${task.result.protectedCells} 个公式文本`}</p>
      <TextUtilityResult text={task.result.text} key={task.result.text} name={`table.${task.result.extension}`} mime={task.result.mime} />
      <h2>表格预览</h2><p className="utility-muted">仅预览前 101 行、20 列，每格前 300 字符；下载保留完整数据。</p><div className="table-data-preview"><table><tbody>{task.result.preview.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>
    </> : <p className="utility-muted">选择输入和输出格式后开始转换。</p>}</section></div>
  </UtilityShell>;
}
