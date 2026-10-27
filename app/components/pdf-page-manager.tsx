"use client";
import { toolLimits } from "../lib/resource-limits";
/* eslint-disable @next/next/no-img-element -- Local PDF preview is a revocable Blob URL. */
import { useEffect, useRef, useState } from "react";
import { UtilityShell } from "./utility-shell";
import {
  LocalUpload,
  LocalDownload,
  TaskFeedback,
  useBlobUrl,
  useLocalTask,
} from "./local-workbench";
import { checkFiles } from "../lib/local-files";
import { parsePageSelection, type PdfPageChoice } from "../lib/pdf-selection";
import { runFileWorker } from "../lib/file-worker-client";
import { WorkbenchPagination } from "./workbench-pagination";
import { createPdfPreviewSession } from "../lib/pdf-preview-session";
import { ResultContinue } from "./tool-handoff";
import { resultFile } from "../lib/tool-handoff";
type Source = { file: File; bytes: Uint8Array; pages: number };
function PdfPreview({
  file,
  page,
  rotation,
}: {
  file?: File;
  page: number;
  rotation: number;
}) {
  const [preview, setPreview] = useState<{
    file: File;
    page: number;
    blob: Blob | null;
    error: string;
  } | null>(null);
  const session = useRef<ReturnType<typeof createPdfPreviewSession> | null>(null);
  const current =
      preview?.file === file && preview?.page === page ? preview : null,
    url = useBlobUrl(current?.blob);
  useEffect(() => {
    if (!file) return;
    const owner = createPdfPreviewSession(file); session.current = owner;
    return () => { if (session.current === owner) session.current = null; void owner.dispose(); };
  }, [file]);
  useEffect(() => {
    const controller = new AbortController(), owner = session.current;
    if (file && owner)
      void owner.render(page + 1, controller.signal, 0.7).then((result) => {
        if (!controller.signal.aborted) setPreview({ file, page, blob: result.blob, error: "" });
      }).catch((cause) => {
        if (!controller.signal.aborted)
          setPreview({
            file,
            page,
            blob: null,
            error: cause instanceof Error ? cause.message : "PDF 页面预览失败。",
          });
      });
    return () => controller.abort();
  }, [file, page]);
  return (
    <div className="pdf-page-preview">
      {url ? (
        <img
          src={url}
          alt={`第 ${page + 1} 页预览`}
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      ) : (
        <p className="utility-muted">
          {current?.error ||
            (file ? "正在生成页面预览…" : "导入 PDF 后选择页面预览")}
        </p>
      )}
    </div>
  );
}
export default function PdfPageManager() {
  const [sources, setSources] = useState<Source[]>([]),
    [pages, setPages] = useState<PdfPageChoice[]>([]),
    [selected, setSelected] = useState(0),
    [range, setRange] = useState("");
  const loading = useLocalTask<Source[]>(),
    task = useLocalTask<{ blob: Blob; name: string }>(),
    busy = loading.busy || task.busy;
  function update(next: PdfPageChoice[]) {
    setPages(next);
    setSelected(0);
    task.reset();
  }
  function move(index: number, step: number) {
    const next = [...pages];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    update(next);
  }
  const choice = pages[selected];
  async function exportPages(split: boolean) {
    void task.run(async (signal) => {
      const bytes = await runFileWorker<Uint8Array>(
        {
          action: split ? "pdf-split" : "pdf-build",
          sources: sources.map((source) => source.bytes),
          choices: pages,
        },
        signal,
      );
      return {
        blob: new Blob([new Uint8Array(bytes)], {
          type: split ? "application/zip" : "application/pdf",
        }),
        name: split ? "split-pages.zip" : "managed-pages.pdf",
      };
    });
  }
  return (
    <UtilityShell
      title="PDF 页面管理"
      description="合并、拆分、删除、排序和旋转 PDF 页面，保留页面内容。"
    >
      <LocalUpload
        accept=".pdf"
        multiple
        disabled={busy}
        title="导入 PDF（可追加）"
        hint="最多 100 个 PDF · 总大小 200 MB · 单文件 1000 页 · 合计 2000 页"
        onFiles={async (files) => {
          task.reset();
          const added = await loading.run(async (signal) => {
            checkFiles(
              [...sources.map((s) => s.file), ...files],
              toolLimits.pdf.bytes,
              toolLimits.pdf.files,
            );
            const next = [];
            for (const file of files) {
              if (!/\.pdf$/i.test(file.name))
                throw new Error("请选择 PDF 文件。");
              const bytes = new Uint8Array(await file.arrayBuffer());
              const info = await runFileWorker<{ rotation: number }[]>(
                { action: "pdf-inspect", data: bytes },
                signal,
              );
              if (info.length > toolLimits.pdf.sourcePages) throw new Error("单个 PDF 最多 1000 页。");
              next.push({ file, bytes, pages: info.length });
            }
            if (
              [...sources, ...next].reduce((sum, s) => sum + s.pages, 0) > toolLimits.pdf.outputPages
            )
              throw new Error("合计最多 2000 页。");
            return next;
          });
          if (added) {
            setSources([...sources, ...added]);
            update([
              ...pages,
              ...added.flatMap((s, i) =>
                Array.from({ length: s.pages }, (_, page) => ({
                  source: sources.length + i,
                  page,
                  rotation: 0,
                })),
              ),
            ]);
          }
        }}
      />
      <TaskFeedback task={loading} />
      <p className="utility-muted">
        密码保护的 PDF
        请先解锁。书签、数字签名和可编辑表单可能无法保留；拆分结果打包下载，不改变原文件。
      </p>
      {sources.length > 0 && (
        <div className="workbench-two">
          <section className="utility-panel utility-controls">
            <h2>页面管理 · {pages.length} 页</h2>
            <label>
              保留 / 重排输出页码（如 3,1-2）
              <input
                value={range}
                onChange={(e) => setRange(e.target.value)}
                placeholder="1-3,5"
              />
            </label>
            <div className="utility-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  try {
                    update(
                      parsePageSelection(range, pages.length).map(
                        (i) => pages[i],
                      ),
                    );
                    setRange("");
                  } catch (cause) {
                    task.setError((cause as Error).message);
                  }
                }}
              >
                应用页码
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  update(
                    sources.flatMap((s, source) =>
                      Array.from({ length: s.pages }, (_, page) => ({
                        source,
                        page,
                        rotation: 0,
                      })),
                    ),
                  )
                }
              >
                恢复全部页面
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setSources([]);
                  update([]);
                  loading.reset();
                }}
              >
                清空 PDF
              </button>
            </div>
            <div className="pdf-page-grid">
              {pages.slice(Math.floor(selected / toolLimits.pageRows) * toolLimits.pageRows, (Math.floor(selected / toolLimits.pageRows) + 1) * toolLimits.pageRows).map((item, visibleIndex) => {
                const i = Math.floor(selected / toolLimits.pageRows) * toolLimits.pageRows + visibleIndex;
                return (
                <article
                  key={`${item.source}-${item.page}`}
                  className={selected === i ? "is-selected" : ""}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-pressed={selected === i}
                  >
                    <strong>输出第 {i + 1} 页</strong>
                    <span>{sources[item.source].file.name}</span>
                    <small>
                      原第 {item.page + 1} 页 · 旋转 {item.rotation}°
                    </small>
                  </button>
                  <div className="utility-actions">
                    <button
                      type="button"
                      aria-label={`上移第 ${i + 1} 页`}
                      disabled={busy || i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`下移第 ${i + 1} 页`}
                      disabled={busy || i === pages.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const next = pages.map((p, n) =>
                          n === i
                            ? { ...p, rotation: (p.rotation + 90) % 360 }
                            : p,
                        );
                        update(next);
                        setSelected(i);
                      }}
                    >
                      旋转
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => update(pages.filter((_, n) => n !== i))}
                    >
                      删除
                    </button>
                  </div>
                </article>
              ); })}
            </div>
            <WorkbenchPagination total={pages.length} page={Math.floor(selected / toolLimits.pageRows)} onPage={(page) => setSelected(page * toolLimits.pageRows)} />
          </section>
          <section className="utility-panel">
            <h2>页面预览</h2>
            <PdfPreview
              file={choice ? sources[choice.source].file : undefined}
              page={choice?.page ?? 0}
              rotation={choice?.rotation ?? 0}
            />
            <div className="utility-actions">
              <button
                type="button"
                disabled={busy || !pages.length}
                onClick={() => void exportPages(false)}
              >
                合并 / 导出 PDF
              </button>
              <button
                type="button"
                disabled={busy || !pages.length}
                onClick={() => void exportPages(true)}
              >
                逐页拆分（ZIP）
              </button>
            </div>
          </section>
        </div>
      )}
      <TaskFeedback task={task} />
      {task.result && (
        <><LocalDownload blob={task.result.blob} name={task.result.name} />{task.result.blob.type === "application/pdf" && <ResultContinue source="PDF 页面管理" targets={["/pdf-page-numbers", "/pdf-cropper"]} getFiles={() => task.result ? [resultFile(task.result.blob, task.result.name, "application/pdf")] : []} />}</>
      )}
    </UtilityShell>
  );
}
