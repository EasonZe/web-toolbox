"use client";
import { useState, type ReactNode } from "react";
import type { RegexResult } from "../lib/regex-tester";
import { runRegex } from "../lib/regex-worker-client";
import { toolLimits } from "../lib/resource-limits";
import { useLocalTask, TaskFeedback } from "./local-workbench";
import { UtilityShell } from "./utility-shell";

function highlighted(text: string, result: RegexResult) {
  const preview = text.slice(0, toolLimits.regex.previewChars), nodes: ReactNode[] = [];
  let cursor = 0;
  result.matches.forEach((match, i) => {
    if (match.start > preview.length) return;
    nodes.push(preview.slice(cursor, match.start));
    nodes.push(<mark key={i}>{match.start === match.end ? "▏" : preview.slice(match.start, match.end)}</mark>);
    cursor = Math.min(match.end, preview.length);
  });
  nodes.push(preview.slice(cursor)); return nodes;
}
export default function RegexTester() {
  const [pattern, setPattern] = useState("(?<name>[A-Za-z]+)=(?<value>\\d+)"), [flags, setFlags] = useState("g"), [text, setText] = useState("width=1920\nheight=1080"), [shown, setShown] = useState(100);
  const task = useLocalTask<RegexResult>();
  return <UtilityShell className="additional-utilities" title="正则表达式测试" description="测试 JavaScript 正则，查看匹配高亮、位置与捕获组。">
    <section className="utility-panel utility-controls"><label>表达式（不用填写两侧斜杠）<input value={pattern} maxLength={toolLimits.regex.patternChars} spellCheck={false} onChange={(e) => { task.reset(); setPattern(e.target.value); }} /></label>
      <fieldset className="compact-options"><legend>匹配标志</legend>{[["g", "全局"], ["i", "忽略大小写"], ["m", "多行"], ["s", "点匹配换行"], ["u", "Unicode"], ["y", "粘连"]].map(([flag, label]) => <label className="utility-checkbox" key={flag}><input type="checkbox" checked={flags.includes(flag)} onChange={(e) => { task.reset(); setFlags(e.target.checked ? flags + flag : flags.replace(flag, "")); }} />{flag} · {label}</label>)}</fieldset>
      <label>测试文本<textarea rows={7} value={text} maxLength={toolLimits.regex.textChars} spellCheck={false} onChange={(e) => { task.reset(); setText(e.target.value); }} /></label>
      <button className="primary-button" type="button" disabled={task.busy} onClick={() => { setShown(100); void task.run((signal) => runRegex({ pattern, flags, text }, signal)); }}>{task.busy ? "正在测试…" : "测试匹配"}</button><TaskFeedback task={task} />
    </section>
    {task.result && <><section className="utility-panel"><h2>{task.result.limited ? "至少 " : ""}{task.result.matches.length} 个匹配</h2><pre className="regex-highlight utility-code-output">{highlighted(text, task.result)}</pre>
      <p className="utility-muted">位置按 UTF-16 字符索引，从 0 开始；结束位置不包含在匹配中。▏表示零长度匹配。{text.length > toolLimits.regex.previewChars && " 高亮仅预览前 5 万字符，测试使用完整输入。"}{task.result.limited && " 已达到 1000 条显示上限，请缩小匹配范围。"}</p></section>
      {!!task.result.matches.length && <section className="utility-panel"><h2>匹配详情</h2><ol className="regex-match-list">{task.result.matches.slice(0, shown).map((match, index) => <li key={index}><strong>#{index + 1} · [{match.start}, {match.end})</strong><pre className="utility-code-output">{text.slice(match.start, Math.min(match.end, match.start + 500)) || "（空匹配）"}{match.end - match.start > 500 && "…（已截短）"}</pre>{!!match.groups.length && <pre className="utility-code-output">{JSON.stringify({ groups: match.groups, named: match.named }, null, 2)}</pre>}</li>)}</ol>{shown < task.result.matches.length && <button type="button" onClick={() => setShown(shown + 100)}>再显示 100 条</button>}<p className="utility-muted">每条匹配显示前 100 个捕获组，每组最多预览 500 字符；null 表示该组未参与匹配。</p></section>}</>}
  </UtilityShell>;
}
