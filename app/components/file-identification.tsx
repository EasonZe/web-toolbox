"use client";
import { useMemo } from "react";
import type { FileIdentification } from "../lib/file-identification";
import { fileSize } from "../lib/local-files";
import { runFileWorker } from "../lib/file-worker-client";
import { LocalUpload, LocalDownload, TaskFeedback, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";
const statuses = { match: "扩展名相符", mismatch: "扩展名可能不符", container: "容器子类型待确认", unknown: "未能确定", "no-extension": "文件没有扩展名" };
export default function FileIdentificationTool() {
  const task = useLocalTask<(FileIdentification & { error?: string })[]>();
  const report = useMemo(() => task.result ? new Blob([JSON.stringify(task.result, null, 2)], { type: "application/json;charset=utf-8" }) : null, [task.result]);
  return <UtilityShell className="additional-utilities" title="文件真实类型识别" description="通过二进制文件头识别格式，检查扩展名是否相符；只采样、不执行文件。">
    <LocalUpload multiple title="选择文件 / 拖入多个文件" hint="最多 200 个 · 每个仅读取前 64 KiB，不整文件载入，无固定源文件大小上限" onFiles={async (files) => {
      await task.run((signal, report) => runFileWorker<(FileIdentification & { error?: string })[]>({ action: "file-identify", files }, signal, report));
    }} /><TaskFeedback task={task} />
    <p className="utility-muted">文件头识别属于启发式判断，不是病毒扫描、完整性检查或可打开保证。纯文本、JSON、SVG 和部分格式可能无法识别；不会使用系统 MIME 或文件名充当检测结果。ZIP / GZIP 头只确认容器，不确认 Office 等内部类型。</p>
    {report && <LocalDownload blob={report} name="file-types.json" title="下载识别报告" />}
    {task.result && <div className="file-identification-results">{task.result.map((item, index) => <section className="utility-panel utility-controls" key={index}><h2>{item.name}</h2><p className="utility-muted">{fileSize(item.size)} · {statuses[item.status]}</p>
      <dl className="workbench-details"><dt>检测格式</dt><dd>{item.extension ? `.${item.extension}` : "未识别"}</dd><dt>检测 MIME</dt><dd>{item.detected}</dd><dt>系统提供 MIME（仅参考）</dt><dd>{item.declared}</dd><dt>读取样本</dt><dd>{item.sampleBytes.toLocaleString()} 字节</dd></dl>
      {item.hex && <pre className="utility-code-output">{item.hex}</pre>}<p className="utility-muted">{item.note}</p>{item.error && <p className="utility-error">{item.error}</p>}
    </section>)}</div>}
  </UtilityShell>;
}
