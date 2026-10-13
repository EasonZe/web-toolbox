"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { UtilityShell } from "./utility-shell";
import { LocalUpload, TaskFeedback, useLocalTask } from "./local-workbench";
import {
  compareTexts,
  inspectJson,
  inspectUnicode,
  type DiffRow,
} from "../lib/text-inspection";
import { downloadLocal, readTextFile } from "../lib/local-files";

function useCopy() {
  const [message, setMessage] = useState("");
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("已复制。");
    } catch {
      setMessage("复制失败，请手动选择文字复制。");
    }
  }
  return { message, copy };
}
export function TextDiff() {
  const [left, setLeft] = useState(""),
    [right, setRight] = useState(""),
    task = useLocalTask<DiffRow[]>();
  async function importText(files: File[], side: "left" | "right") {
    task.reset();
    try {
      const text = await readTextFile(files[0]);
      if (text.length > 50000) throw new Error("每份文本最多 5 万字符。");
      if (side === "left") setLeft(text);
      else setRight(text);
    } catch (cause) {
      task.setError((cause as Error).message);
    }
  }
  let oldLine = 0,
    newLine = 0;
  return (
    <UtilityShell
      title="文本差异对比"
      description="左右对照文本，高亮新增、删除与修改内容。"
    >
      <div className="workbench-two">
        <section className="utility-panel utility-controls">
          <h2>原始文本</h2>
          <LocalUpload
            hint="文本文件 · 最大 2 MB / 5 万字符"
            onFiles={(files) => importText(files, "left")}
          />
          <textarea
            aria-label="原始文本"
            rows={12}
            maxLength={50000}
            value={left}
            onChange={(e) => {
              setLeft(e.target.value);
              task.reset();
            }}
          />
        </section>
        <section className="utility-panel utility-controls">
          <h2>修改后文本</h2>
          <LocalUpload
            hint="文本文件 · 最大 2 MB / 5 万字符"
            onFiles={(files) => importText(files, "right")}
          />
          <textarea
            aria-label="修改后文本"
            rows={12}
            maxLength={50000}
            value={right}
            onChange={(e) => {
              setRight(e.target.value);
              task.reset();
            }}
          />
        </section>
      </div>
      <div className="utility-actions">
        <button
          type="button"
          disabled={task.busy}
          onClick={() => void task.run(async () => compareTexts(left, right))}
        >
          开始对比
        </button>
        <button
          type="button"
          onClick={() => {
            setLeft(right);
            setRight(left);
            task.reset();
          }}
        >
          交换左右
        </button>
      </div>
      <TaskFeedback task={task} />
      {task.result && (
        <section aria-label="差异结果">
          <p className="utility-muted">
            新增 {task.result.filter((r) => r.kind === "added").length} 行 ·
            删除 {task.result.filter((r) => r.kind === "removed").length} 行 ·
            修改 {task.result.filter((r) => r.kind === "changed").length} 行
          </p>
          <div className="workbench-table-scroll">
            <table className="workbench-table diff-table">
              <thead>
                <tr>
                  <th>原始文本</th>
                  <th>修改后文本</th>
                </tr>
              </thead>
              <tbody>
                {task.result.map((row, i) => (
                  <tr key={i} className={`diff-${row.kind}`}>
                    <td>
                      <span className="diff-line-number">
                        {row.old === null ? "" : ++oldLine}
                      </span>
                      <code>
                        {row.oldParts
                          ? row.oldParts.map((part, j) =>
                              part.changed ? (
                                <mark key={j}>{part.value}</mark>
                              ) : (
                                <span key={j}>{part.value}</span>
                              ),
                            )
                          : (row.old ?? "")}
                      </code>
                    </td>
                    <td>
                      <span className="diff-line-number">
                        {row.next === null ? "" : ++newLine}
                      </span>
                      <code>
                        {row.nextParts
                          ? row.nextParts.map((part, j) =>
                              part.changed ? (
                                <mark key={j}>{part.value}</mark>
                              ) : (
                                <span key={j}>{part.value}</span>
                              ),
                            )
                          : (row.next ?? "")}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </UtilityShell>
  );
}
export function JsonFormatter() {
  const [text, setText] = useState(""),
    task = useLocalTask<ReturnType<typeof inspectJson>>(),
    input = useRef<HTMLTextAreaElement>(null),
    copy = useCopy();
  function locate() {
    const result = task.result;
    if (!result || result.offset < 0) return;
    input.current?.focus();
    input.current?.setSelectionRange(
      result.offset,
      result.offset + result.length,
    );
  }
  return (
    <UtilityShell
      title="JSON 格式化与校验"
      description="格式化或压缩 JSON，定位语法错误，保留原始数字精度。"
    >
      <LocalUpload
        accept=".json,.txt"
        hint="JSON / TXT · 最大 2 MB"
        onFiles={async (files) => {
          task.reset();
          try {
            setText(await readTextFile(files[0]));
          } catch (cause) {
            task.setError((cause as Error).message);
          }
        }}
      />
      <div className="workbench-two">
        <section className="utility-panel utility-controls">
          <h2>输入 JSON</h2>
          <textarea
            ref={input}
            aria-label="输入 JSON"
            spellCheck={false}
            rows={20}
            maxLength={1_000_000}
            placeholder={'{"name":"Eason"}'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              task.reset();
            }}
          />
          <div className="utility-actions">
            <button
              type="button"
              onClick={() => void task.run(async () => inspectJson(text))}
            >
              格式化 / 校验
            </button>
            <button
              type="button"
              onClick={() => void task.run(async () => inspectJson(text, true))}
            >
              压缩
            </button>
          </div>
        </section>
        <section className="utility-panel utility-controls">
          <h2>处理结果</h2>
          <textarea
            aria-label="JSON 处理结果"
            readOnly
            rows={20}
            value={task.result?.output ?? ""}
          />
          <div className="utility-actions">
            <button
              type="button"
              disabled={!task.result?.output}
              onClick={() => void copy.copy(task.result!.output)}
            >
              复制
            </button>
            <button
              type="button"
              disabled={!task.result?.output}
              onClick={() =>
                downloadLocal(
                  new Blob([task.result!.output], {
                    type: "application/json;charset=utf-8",
                  }),
                  "formatted.json",
                )
              }
            >
              导出 JSON
            </button>
          </div>
          {task.result?.error && (
            <>
              <p className="utility-error" role="alert">
                {task.result.error}
              </p>
              <button type="button" onClick={locate}>
                定位错误
              </button>
            </>
          )}
          <p className="utility-muted" role="status">
            {copy.message}
          </p>
        </section>
      </div>
      <TaskFeedback task={task} />
    </UtilityShell>
  );
}
export function MarkdownEditor() {
  const [text, setText] = useState(
      "# Markdown 编辑与预览\n\n在左侧编辑，这里会实时更新。\n\n- 支持列表与表格\n- 支持 **粗体** 和 `代码`\n",
    ),
    task = useLocalTask<string>(),
    copy = useCopy();
  const run = task.run;
  useEffect(() => {
    const timer = setTimeout(
      () =>
        void run(async (signal) => {
          const [{ marked }, { default: purify }] = await Promise.all([
            import("marked"),
            import("dompurify"),
          ]);
          signal.throwIfAborted();
          const raw = marked.parse(text, { async: false, gfm: true });
          const clean = purify.sanitize(raw, {
            USE_PROFILES: { html: true },
            FORBID_ATTR: [
              "style",
              "ping",
              "src",
              "srcset",
              "poster",
              "background",
              "action",
              "formaction",
            ],
            FORBID_TAGS: [
              "img",
              "video",
              "audio",
              "source",
              "iframe",
              "object",
              "embed",
              "form",
              "input",
              "style",
              "link",
              "meta",
            ],
          });
          const document = new DOMParser().parseFromString(clean, "text/html");
          document.querySelectorAll("a").forEach((a) => {
            a.target = "_blank";
            a.rel = "noopener noreferrer";
          });
          return document.body.innerHTML;
        }),
      250,
    );
    return () => clearTimeout(timer);
  }, [text, run]);
  function exportHtml() {
    if (task.result === null) return;
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Markdown 文档</title><style>body{max-width:900px;margin:40px auto;padding:20px;font:16px/1.7 system-ui}pre{overflow:auto;background:#f5f5f5;padding:16px}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}</style><body>${task.result}</body></html>`;
    downloadLocal(
      new Blob([html], { type: "text/html;charset=utf-8" }),
      "document.html",
    );
  }
  return (
    <UtilityShell
      title="Markdown 编辑与预览"
      description="实时预览 Markdown，并导出 Markdown 或净化后的 HTML。"
    >
      <div className="utility-actions">
        <button
          type="button"
          onClick={() =>
            downloadLocal(
              new Blob([text], { type: "text/markdown;charset=utf-8" }),
              "document.md",
            )
          }
        >
          导出 Markdown
        </button>
        <button
          type="button"
          disabled={task.result === null}
          onClick={exportHtml}
        >
          导出 HTML
        </button>
        <button type="button" onClick={() => void copy.copy(text)}>
          复制 Markdown
        </button>
      </div>
      <div className="workbench-two">
        <section className="utility-panel utility-controls">
          <h2>Markdown</h2>
          <LocalUpload
            accept=".md,.markdown,.txt"
            hint="Markdown / TXT · 最大 2 MB"
            onFiles={async (files) => {
              try {
                const next = await readTextFile(files[0]);
                if (next.length > 200000)
                  throw new Error("Markdown 最多 20 万字符。");
                task.reset();
                setText(next);
              } catch (cause) {
                task.setError((cause as Error).message);
              }
            }}
          />
          <textarea
            aria-label="Markdown 编辑内容"
            rows={24}
            spellCheck={false}
            maxLength={200000}
            value={text}
            onChange={(e) => {
              task.reset();
              setText(e.target.value);
            }}
          />
        </section>
        <section className="utility-panel">
          <h2>实时预览</h2>
          <div
            className="markdown-preview"
            aria-label="Markdown 实时预览"
            dangerouslySetInnerHTML={{ __html: task.result ?? "" }}
          />
          <p className="utility-muted">
            出于安全与隐私考虑，不加载外部图片、脚本、表单与嵌入内容。
          </p>
        </section>
      </div>
      <TaskFeedback task={task} />
      <p className="utility-muted" role="status">
        {copy.message}
      </p>
    </UtilityShell>
  );
}
export function UnicodeInspector() {
  const [text, setText] = useState(""),
    [onlyHidden, setOnlyHidden] = useState(false);
  const data = useMemo(() => {
    try {
      return { rows: inspectUnicode(text), error: "" };
    } catch (cause) {
      return { rows: [], error: (cause as Error).message };
    }
  }, [text]);
  const rows = onlyHidden ? data.rows.filter((row) => row.hidden) : data.rows;
  return (
    <UtilityShell
      title="Unicode 字符检查"
      description="查看 Unicode、UTF-16 与 UTF-8 编码，检测零宽字符和隐藏空格。"
    >
      <section className="utility-panel utility-controls">
        <label>
          输入文字
          <textarea
            aria-label="Unicode 检查文本"
            rows={7}
            maxLength={10000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="utility-checkbox">
          <input
            type="checkbox"
            checked={onlyHidden}
            onChange={(e) => setOnlyHidden(e.target.checked)}
          />
          只显示隐藏与特殊字符
        </label>
        <p className="utility-muted">
          共 {data.rows.length} 个字符 · 隐藏 / 特殊字符{" "}
          {data.rows.filter((row) => row.hidden).length} 个 · 最多 5000 个字符
        </p>
        <button
          type="button"
          disabled={!data.rows.length}
          onClick={() =>
            downloadLocal(
              new Blob([JSON.stringify(data.rows, null, 2)], {
                type: "application/json",
              }),
              "unicode-report.json",
            )
          }
        >
          导出检查报告
        </button>
      </section>
      {data.error && (
        <p role="alert" className="utility-error">
          {data.error}
        </p>
      )}
      <div className="workbench-table-scroll">
        <table className="workbench-table">
          <thead>
            <tr>
              <th>位置（UTF-16）</th>
              <th>字符 / 说明</th>
              <th>Unicode</th>
              <th>UTF-16</th>
              <th>UTF-8</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.position}
                className={row.hidden ? "unicode-hidden" : ""}
              >
                <td>{row.position + 1}</td>
                <td>{row.name || row.character}</td>
                <td>
                  <code>{row.code}</code>
                </td>
                <td>
                  <code>{row.utf16}</code>
                </td>
                <td>
                  <code>{row.utf8}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </UtilityShell>
  );
}
