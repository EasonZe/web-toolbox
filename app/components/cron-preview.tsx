"use client";
import { useState } from "react";
import type { CronPreview } from "../lib/cron-preview";
import { runFileWorker } from "../lib/file-worker-client";
import { TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityResult } from "./text-utility-parts";
import { UtilityShell } from "./utility-shell";
export default function CronPreviewTool() {
  const [expression, setExpression] = useState("0 9 * * 1-5"), [timezone, setTimezone] = useState("Asia/Shanghai"), [from, setFrom] = useState(""), [count, setCount] = useState(10);
  const task = useLocalTask<CronPreview>();
  return <UtilityShell className="additional-utilities" title="Cron 表达式预览" description="校验五段或六段含秒的 Cron，按 IANA 时区查看后续执行时间；不创建定时任务。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>表达式设置</h2>
      <div className="utility-actions">{[["*/5 * * * *", "每 5 分钟"], ["0 9 * * *", "每天 9 点"], ["0 9 * * 1-5", "工作日 9 点"], ["0 0 1 * *", "每月 1 日"]].map(([value, label]) => <button key={value} type="button" onClick={() => { task.reset(); setExpression(value); }}>{label}</button>)}</div>
      <label>Cron 表达式<input value={expression} maxLength={500} spellCheck={false} onChange={(e) => { task.reset(); setExpression(e.target.value); }} /></label>
      <label>IANA 时区<input list="cron-timezones" value={timezone} maxLength={80} onChange={(e) => { task.reset(); setTimezone(e.target.value); }} /></label><datalist id="cron-timezones">{["Asia/Shanghai", "Asia/Tokyo", "UTC", "Europe/London", "America/New_York", "Australia/Sydney"].map((value) => <option key={value} value={value} />)}</datalist>
      <label>起算时间（含时区的 ISO 8601）<input value={from} maxLength={40} placeholder="留空使用当前时间" spellCheck={false} onChange={(e) => { task.reset(); setFrom(e.target.value); }} /></label>
      <button type="button" onClick={() => { task.reset(); setFrom(new Date().toISOString()); }}>填入当前时间</button>
      <label>预览数量<input type="number" min="1" max="50" value={count} onChange={(e) => { task.reset(); setCount(Number(e.target.value)); }} /></label>
      <button className="primary-button" type="button" disabled={task.busy} onClick={() => void task.run((signal) => runFileWorker<CronPreview>({ action: "cron-preview", options: { expression, timezone, from, count } }, signal))}>计算后续时间</button><TaskFeedback task={task} />
      <p className="utility-muted">五段为“分 时 日 月 周”，六段在开头增加秒；无年份字段。日与周同时限定时采用 OR 规则，不等同于 Quartz。支持范围由 cron-parser 决定；不支持 H 随机字段、@ 别名。夏令时跳过/重复规则请以实际调度平台为准。</p>
    </section><section className="utility-panel"><h2>后续执行预览</h2>{task.result ? <>
      <dl className="cron-field-list">{task.result.fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.token}</dd></div>)}</dl><TextUtilityResult text={task.result.text} name="cron-preview.txt" />
    </> : <p className="utility-muted">结果从起算时间之后开始，显示所选时区和 UTC，包含时区偏移。</p>}</section></div>
  </UtilityShell>;
}
