"use client";
import { useState } from "react";
import type { extractPptx } from "../lib/pptx-extract";
import { runFileWorker } from "../lib/file-worker-client";
import { toolLimits } from "../lib/resource-limits";
import { fileSize } from "../lib/local-files";
import { UtilityShell } from "./utility-shell";
import { TextUtilityResult } from "./text-utility-parts";
import { LocalUpload, LocalDownload, TaskFeedback, useLocalTask } from "./local-workbench";
export default function PptxExtractor() {
  const task = useLocalTask<Awaited<ReturnType<typeof extractPptx>>>(), [page, setPage] = useState(0), result = task.result, total = Math.max(1, Math.ceil((result?.images.length ?? 0) / toolLimits.pageRows));
  return <UtilityShell className="additional-utilities" title="PPTX 图片与文字提取" description="按幻灯片顺序提取正文与表格文字，导出包内原始图片素材；不上传、不执行宏，也不调用 AI。">
    <LocalUpload accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" title="选择 PPTX 文件" hint="最多 200 MiB · 展开预算桌面 512 MiB / 移动端 256 MiB · 最多 2000 个 ZIP 条目" onFiles={async (files) => { setPage(0); await task.run((signal, report) => { if (files.length !== 1) throw new Error("请选择一个 PPTX。"); return runFileWorker({ action: "pptx-extract", file: files[0] }, signal, report); }); }} /><TaskFeedback task={task} />
    <p className="utility-muted">只支持 .pptx，不支持旧 .ppt、加密文件或 .pptm。文字不含 OCR、备注、图表/SmartArt 的完整内容或复杂版面还原；图片是包内素材，可能含母版、备注和未使用资源，不等于幻灯片截图。</p>
    {result && <><div className="utility-panel utility-controls"><h2>提取结果</h2><p className="utility-muted">{result.slides} 页 · {result.images.length} 张图片 · {result.emptySlides} 页未提取到文字</p><LocalDownload blob={result.blob} name="pptx-extracted.zip" title="下载全部图片、文字与清单" /></div>
      <div className="utility-columns"><section className="utility-panel"><h2>幻灯片文字</h2><TextUtilityResult text={result.text} name="slides.txt" /></section><section className="utility-panel utility-controls"><h2>图片素材</h2><p className="utility-muted">格式保持原样；MIME 来自包内声明，仅供参考，不代表安全或可打开。不会自动预览或执行 SVG / WMF 等素材。</p>
        {!result.images.length && <p className="utility-muted">没有找到声明为图片的包内素材。</p>}
        {result.images.slice(page * toolLimits.pageRows, (page + 1) * toolLimits.pageRows).map((item) => <div className="pptx-image-item" key={item.source}><strong>{item.source}</strong><span>{fileSize(item.size)} · 声明类型 {item.mime}</span><LocalDownload blob={item.blob} name={item.name.split("/").at(-1)!} title="下载此素材" /></div>)}
        {total > 1 && <div className="utility-actions"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1} / {total}</span><button type="button" disabled={page + 1 >= total} onClick={() => setPage(page + 1)}>下一页</button></div>}
      </section></div></>}
  </UtilityShell>;
}
