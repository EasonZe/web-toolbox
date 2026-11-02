"use client";
import { useState } from "react";
import { toolLimits } from "../lib/resource-limits";
import { sqlDialects, type SqlFormatOptions, type SqlFormatResult } from "../lib/sql-format-options";
import { runFileWorker } from "../lib/file-worker-client";
import { UtilityShell } from "./utility-shell";
import { TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityInput, TextUtilityResult } from "./text-utility-parts";

export default function SqlFormatter() {
  const [text, setText] = useState("select category, count(*) as total from tools where enabled = 1 group by category order by total desc;");
  const [options, setOptions] = useState<SqlFormatOptions>({ dialect: "sql", indent: 2, keywordCase: "upper" });
  const [inputKey, setInputKey] = useState(0);
  const task = useLocalTask<SqlFormatResult>();
  function changeOptions(next: Partial<SqlFormatOptions>) { task.reset(); setOptions({ ...options, ...next }); }
  return <UtilityShell className="additional-utilities sql-workbench" title="SQL 格式化" description="整理 SQL 缩进与关键词大小写，支持常用数据库方言、复制和文件导出。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>SQL 文本</h2>
      <TextUtilityInput key={inputKey} text={text} label="输入 SQL" accept=".sql,.txt,text/plain,application/sql" limit={toolLimits.text.formatChars} onChange={(value) => { task.reset(); setText(value); }} />
      <div className="sql-format-fields">
        <label>SQL 方言<select value={options.dialect} onChange={(e) => changeOptions({ dialect: e.target.value as SqlFormatOptions["dialect"] })}>{sqlDialects.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>缩进<select value={options.indent} onChange={(e) => changeOptions({ indent: Number(e.target.value) as SqlFormatOptions["indent"] })}><option value={2}>2 个空格</option><option value={4}>4 个空格</option></select></label>
        <label>关键词大小写<select value={options.keywordCase} onChange={(e) => changeOptions({ keywordCase: e.target.value as SqlFormatOptions["keywordCase"] })}><option value="upper">大写</option><option value="lower">小写</option><option value="preserve">保留原样</option></select></label>
      </div>
      <div className="utility-actions"><button type="button" className="primary-button" disabled={task.busy || !text.trim()} onClick={() => void task.run((signal) => runFileWorker<SqlFormatResult>({ action: "sql-format", text, options }, signal))}>格式化 SQL</button><button type="button" onClick={() => { task.reset(); setText(""); setInputKey((key) => key + 1); }}>清空</button></div>
      <TaskFeedback task={task} />
      <p className="utility-muted">只整理文本，不连接数据库、不执行查询，也不验证查询能否在数据库中运行。保留标识符、字符串和占位符；不支持存储过程与自定义分隔符。</p>
      <p className="utility-muted">本地后台处理，不上传或保存输入。大文本可能较慢，可随时取消；超过 30 秒会停止处理，原文保留。</p>
    </section><section className="utility-panel"><h2>格式化结果</h2>{task.result ? <><p className="utility-muted" role="status">{task.result.changed ? "已完成格式化。" : "原文已符合当前格式。"}</p><TextUtilityResult key={task.result.output} text={task.result.output} name="formatted.sql" mime="application/sql" /></> : <p className="utility-muted">选择正确的数据库方言后格式化，结果在这里显示。</p>}</section></div>
  </UtilityShell>;
}
