"use client";
import { useMemo, useState } from "react";
import type { DuplicateResult } from "../lib/duplicate-files";
import { validateDuplicateFiles } from "../lib/duplicate-file-options";
import { runFileWorker } from "../lib/file-worker-client";
import { fileSize } from "../lib/local-files";
import { FileDropZone } from "./file-drop-zone";
import { UtilityShell } from "./utility-shell";
import { LocalDownload, TaskFeedback, useLocalTask } from "./local-workbench";

export default function DuplicateFiles() {
  const [files, setFiles] = useState<File[]>([]), [page, setPage] = useState(0), [uploadKey, setUploadKey] = useState(0);
  const task = useLocalTask<DuplicateResult>();
  const report = useMemo(() => task.result ? new Blob([JSON.stringify(task.result, null, 2)], { type: "application/json;charset=utf-8" }) : null, [task.result]);
  function choose(next: File[]) {
    task.reset(); setFiles([]); setPage(0);
    try { validateDuplicateFiles(next); setFiles(next); } catch (cause) { task.setError(cause instanceof Error ? cause.message : "无法读取文件列表。"); }
  }
  const groups = task.result?.groups.slice(page * 20, page * 20 + 20) ?? [];
  return <UtilityShell className="additional-utilities" title="重复文件检查" description="先按大小筛选，再计算 SHA-256 并逐字节确认，找出内容相同的文件。">
    <FileDropZone key={uploadKey} className="video-file-picker workbench-upload" ariaLabel="选择文件或拖入多个文件" multiple resourceMode="stream" onFiles={choose}><strong>选择文件 / 拖入多个文件</strong><span>2–2000 个文件，只读检查，不上传、不删除原文件。</span></FileDropZone>
    <div className="utility-actions"><label className="duplicate-folder-picker">选择文件夹<input key={uploadKey} type="file" multiple {...{ webkitdirectory: "" }} aria-label="选择文件夹中的文件" onChange={(e) => { choose(Array.from(e.currentTarget.files ?? [])); e.currentTarget.value = ""; }} /></label><button type="button" onClick={() => { task.reset(); setFiles([]); setPage(0); setUploadKey((value) => value + 1); }}>清空</button></div>
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>待检查文件</h2>
      <p className="utility-muted">已选择 {files.length} 个文件 · {fileSize(files.reduce((sum, file) => sum + file.size, 0))}</p>
      {!!files.length && <ul className="duplicate-file-list">{files.slice(0, 20).map((file, index) => <li key={index}><span>{file.webkitRelativePath || file.name}</span><small>{fileSize(file.size)}</small></li>)}</ul>}
      {files.length > 20 && <p className="utility-muted">这里只列出前 20 个，检查包含全部 {files.length} 个文件。</p>}
      <button type="button" className="primary-button" disabled={files.length < 2 || task.busy} onClick={() => { setPage(0); void task.run((signal, progress) => runFileWorker<DuplicateResult>({ action: "duplicate-files", files }, signal, progress)); }}>开始检查重复文件</button><TaskFeedback task={task} />
      <p className="utility-muted">同名不代表重复，改名但内容完全相同仍能识别；零字节文件也可分组。仅扫描手动选中的文件，不能扫描系统盘或回收空间，不按图片相似度分组。</p>
      <p className="utility-muted">按 2 MiB 分块读取，不设置整文件载入上限；单次任务沿用 15 分钟保护，可缩小批次重试。文件夹选择取决于浏览器支持。报告只记录文件名或所选目录内的相对路径，不保存本机绝对路径。</p>
    </section><section className="utility-panel"><h2>检查结果</h2>{task.result ? <>
      <p className="utility-muted" role="status">共检查 {task.result.files} 个，{task.result.hashed} 个进入内容核对；发现 {task.result.groups.length} 组重复、{task.result.redundant} 个冗余副本（合计 {fileSize(task.result.redundantBytes)}）。此处不执行删除。</p>
      {report && <LocalDownload blob={report} name="duplicate-files.json" title="下载完整检查报告" />}
      {!task.result.groups.length && <p className="utility-muted">所选文件中没有发现内容完全相同的文件。</p>}
      {groups.map((group, index) => <section className="duplicate-group" key={`${group.sha256}:${group.files[0].index}`}><h3>第 {page * 20 + index + 1} 组 · {group.files.length} 个文件 · 每个 {fileSize(group.size)}</h3><ul className="duplicate-file-list">{group.files.slice(0, 50).map((file) => <li key={file.index}><span>{file.path}</span><small>第 {file.index + 1} 个</small></li>)}</ul>{group.files.length > 50 && <p className="utility-muted">本组显示前 50 个，完整列表见报告。</p>}<details><summary>查看 SHA-256</summary><code>{group.sha256}</code></details></section>)}
      {task.result.groups.length > 20 && <div className="utility-actions"><button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>上一页</button><span className="utility-muted">{page + 1} / {Math.ceil(task.result.groups.length / 20)}</span><button type="button" disabled={(page + 1) * 20 >= task.result.groups.length} onClick={() => setPage((value) => value + 1)}>下一页</button></div>}
    </> : <p className="utility-muted">选择文件后开始检查。只读分组，不默认指定哪份应该删除。</p>}</section></div>
  </UtilityShell>;
}
