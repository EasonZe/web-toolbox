"use client";
import { useMemo, useState } from "react";
import { UtilityShell } from "./utility-shell";
import {
  LocalUpload,
  LocalDownload,
  TaskFeedback,
  useLocalTask,
} from "./local-workbench";
import { checkFiles, fileSize, safeName } from "../lib/local-files";
import {
  defaultRenameOptions,
  planFileNames,
  type RenameOptions,
} from "../lib/file-renaming";
import type { ArchiveEntry } from "../lib/local-archive";
import { runFileWorker } from "../lib/file-worker-client";

export function BatchRename() {
  const [files, setFiles] = useState<File[]>([]),
    [settings, setSettings] = useState<RenameOptions>({
      ...defaultRenameOptions,
    });
  const task = useLocalTask<Blob>();
  const preview = useMemo(() => {
    try {
      return { names: planFileNames(files, settings), error: "" };
    } catch (cause) {
      return { names: [], error: (cause as Error).message };
    }
  }, [files, settings]);
  function change(patch: Partial<RenameOptions>) {
    setSettings((old) => ({ ...old, ...patch }));
    task.reset();
  }
  function move(index: number, direction: number) {
    task.reset();
    setFiles((old) => {
      const next = [...old];
      [next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ];
      return next;
    });
  }
  return (
    <UtilityShell
      title="批量文件重命名"
      description="序号、替换、日期与名称预览，保留文件内容并打包下载。"
    >
      <LocalUpload
        multiple
        disabled={task.busy}
        title="批量选择文件 / 拖入文件"
        hint="最多 200 个文件 · 总大小不超过 200 MB · 不修改原文件"
        onFiles={(next) => {
          task.reset();
          try {
            checkFiles(next);
            setFiles(next);
          } catch (cause) {
            task.setError((cause as Error).message);
          }
        }}
      />
      <fieldset
        className="workbench-fieldset utility-panel utility-controls"
        disabled={task.busy}
      >
        <legend>重命名规则</legend>
        <div className="workbench-fields">
          <label>
            前缀
            <input
              value={settings.prefix}
              maxLength={50}
              onChange={(e) => change({ prefix: e.target.value })}
            />
          </label>
          <label>
            后缀（扩展名前）
            <input
              value={settings.suffix}
              maxLength={50}
              onChange={(e) => change({ suffix: e.target.value })}
            />
          </label>
          <label>
            查找文字
            <input
              value={settings.find}
              maxLength={100}
              onChange={(e) => change({ find: e.target.value })}
            />
          </label>
          <label>
            替换为
            <input
              value={settings.replace}
              maxLength={100}
              onChange={(e) => change({ replace: e.target.value })}
            />
          </label>
          <label>
            序号起点
            <input
              type="number"
              min="0"
              max="1000000"
              value={settings.start}
              onChange={(e) => change({ start: Number(e.target.value) })}
            />
          </label>
          <label>
            序号位数
            <input
              type="number"
              min="1"
              max="8"
              value={settings.digits}
              onChange={(e) => change({ digits: Number(e.target.value) })}
            />
          </label>
          <label>
            日期来源
            <select
              value={settings.dateSource}
              onChange={(e) =>
                change({
                  dateSource: e.target.value as RenameOptions["dateSource"],
                })
              }
            >
              <option value="none">不添加日期</option>
              <option value="custom">自选日期</option>
              <option value="modified">文件修改日期</option>
            </select>
          </label>
          {settings.dateSource === "custom" && (
            <label>
              日期
              <input
                type="date"
                value={settings.date}
                onChange={(e) => change({ date: e.target.value })}
              />
            </label>
          )}
        </div>
        <label className="utility-checkbox">
          <input
            type="checkbox"
            checked={settings.sequence}
            onChange={(e) => change({ sequence: e.target.checked })}
          />
          添加序号
        </label>
      </fieldset>
      <div className="workbench-table-scroll">
        <table className="workbench-table">
          <thead>
            <tr>
              <th>原文件名</th>
              <th>名称预览</th>
              <th>排序</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, i) => (
              <tr key={i}>
                <td>
                  {file.name}
                  <small>{fileSize(file.size)}</small>
                </td>
                <td>{preview.names[i] ?? "—"}</td>
                <td>
                  <div className="utility-actions">
                    <button
                      type="button"
                      aria-label={`上移文件 ${i + 1}`}
                      disabled={i === 0 || task.busy}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`下移文件 ${i + 1}`}
                      disabled={i === files.length - 1 || task.busy}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.error && (
        <p className="utility-error" role="alert">
          {preview.error}
        </p>
      )}
      <button
        className="primary-button"
        type="button"
        disabled={!files.length || !!preview.error || task.busy}
        onClick={() =>
          void task.run(async (signal, report) => {
            const entries = [];
            for (let i = 0; i < files.length; i++) {
              signal.throwIfAborted();
              entries.push({
                name: preview.names[i],
                data: new Uint8Array(await files[i].arrayBuffer()),
              });
              report(((i + 1) / files.length) * 40, "正在读取文件…");
            }
            const data = await runFileWorker<Uint8Array>(
              { action: "zip-pack", entries },
              signal,
            );
            return new Blob([new Uint8Array(data)], {
              type: "application/zip",
            });
          })
        }
      >
        重命名并打包
      </button>
      <TaskFeedback task={task} />
      {task.result && (
        <LocalDownload
          blob={task.result}
          name="renamed-files.zip"
          title="下载重命名文件 ZIP"
        />
      )}
    </UtilityShell>
  );
}
export function ZipTool() {
  const [mode, setMode] = useState<"pack" | "extract">("pack"),
    [files, setFiles] = useState<File[]>([]),
    [archive, setArchive] = useState<File | null>(null);
  const listing = useLocalTask<ArchiveEntry[]>(),
    task = useLocalTask<{ blob: Blob; name: string }>(),
    busy = listing.busy || task.busy;
  function clear() {
    listing.reset();
    task.reset();
    setArchive(null);
    setFiles([]);
  }
  async function pack(signal: AbortSignal) {
    const seen = new Set<string>(),
      entries = [];
    for (const file of files) {
      const name = safeName(file.name);
      if (seen.has(name)) throw new Error("文件名重复，请先重命名。");
      seen.add(name);
      signal.throwIfAborted();
      entries.push({ name, data: new Uint8Array(await file.arrayBuffer()) });
    }
    return runFileWorker<Uint8Array>({ action: "zip-pack", entries }, signal);
  }
  async function extract(name?: string) {
    if (!archive) return;
    void task.run(async (signal) => {
      const data = new Uint8Array(await archive.arrayBuffer());
      const entries = await runFileWorker<Record<string, Uint8Array>>(
        { action: "zip-extract", data, name },
        signal,
      );
      if (name)
        return {
          blob: new Blob([new Uint8Array(entries[name])]),
          name: safeName(name.split("/").at(-1)!),
        };
      const packed = await runFileWorker<Uint8Array>(
        {
          action: "zip-pack",
          entries: Object.entries(entries).map(([path, value]) => ({
            name: path,
            data: value,
          })),
        },
        signal,
      );
      return {
        blob: new Blob([new Uint8Array(packed)], { type: "application/zip" }),
        name: "extracted-files.zip",
      };
    });
  }
  return (
    <UtilityShell
      title="ZIP 打包与解压"
      description="预览文件列表、单独提取或打包下载全部文件，在浏览器本地处理。"
    >
      <div className="utility-actions">
        <button
          type="button"
          disabled={busy}
          aria-pressed={mode === "pack"}
          onClick={() => {
            clear();
            setMode("pack");
          }}
        >
          ZIP 打包
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={mode === "extract"}
          onClick={() => {
            clear();
            setMode("extract");
          }}
        >
          ZIP 解压
        </button>
      </div>
      {mode === "pack" ? (
        <>
          <LocalUpload
            multiple
            disabled={busy}
            hint="最多 200 个文件 · 总大小不超过 200 MB"
            onFiles={(next) => {
              task.reset();
              try {
                checkFiles(next);
                setFiles(next);
              } catch (cause) {
                task.setError((cause as Error).message);
              }
            }}
          />
          <div className="workbench-table-scroll">
            <table className="workbench-table">
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>大小</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, i) => (
                  <tr key={i}>
                    <td>{file.name}</td>
                    <td>{fileSize(file.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={!files.length || busy}
            onClick={() =>
              void task.run(async (signal) => ({
                blob: new Blob([new Uint8Array(await pack(signal))], {
                  type: "application/zip",
                }),
                name: "files.zip",
              }))
            }
          >
            生成 ZIP
          </button>
        </>
      ) : (
        <>
          <LocalUpload
            accept=".zip"
            disabled={busy}
            hint="ZIP · 最大 200 MB · 最多 200 个条目 · 不支持加密、分卷或 ZIP64"
            onFiles={async (next) => {
              task.reset();
              setArchive(null);
              const result = await listing.run(async (signal) => {
                checkFiles(next, 200 * 1048576, 1);
                if (!/\.zip$/i.test(next[0].name))
                  throw new Error("请选择 ZIP 文件。");
                return runFileWorker<ArchiveEntry[]>(
                  {
                    action: "zip-inspect",
                    data: new Uint8Array(await next[0].arrayBuffer()),
                  },
                  signal,
                );
              });
              if (result) setArchive(next[0]);
            }}
          />
          {listing.result && (
            <>
              <p className="utility-muted">
                {archive?.name} · {listing.result.length} 个条目 · 解压总大小{" "}
                {fileSize(
                  listing.result.reduce((sum, item) => sum + item.size, 0),
                )}
              </p>
              <div className="workbench-table-scroll">
                <table className="workbench-table">
                  <thead>
                    <tr>
                      <th>文件列表</th>
                      <th>大小</th>
                      <th>提取</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listing.result.map((entry) => (
                      <tr key={entry.name}>
                        <td>{entry.name}</td>
                        <td>{fileSize(entry.size)}</td>
                        <td>
                          <button
                            type="button"
                            disabled={busy || entry.name.endsWith("/")}
                            onClick={() => void extract(entry.name)}
                          >
                            单独提取
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={
                  busy ||
                  !listing.result.some((entry) => !entry.name.endsWith("/"))
                }
                onClick={() => void extract()}
              >
                全部下载（ZIP）
              </button>
              <p className="utility-muted">
                全部文件重新打包为
                ZIP，保留文件夹结构，避免浏览器阻止多个下载。路径穿越、超大解压体积和异常压缩比会被拒绝。
              </p>
            </>
          )}
          <TaskFeedback task={listing} />
        </>
      )}
      <TaskFeedback task={task} />
      {task.result && (
        <LocalDownload
          blob={task.result.blob}
          name={task.result.name}
          title="下载处理结果"
        />
      )}
    </UtilityShell>
  );
}
