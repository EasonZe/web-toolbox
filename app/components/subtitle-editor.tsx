"use client";
import { toolLimits } from "../lib/resource-limits";
import { useState } from "react";
import { UtilityShell } from "./utility-shell";
import {
  LocalUpload,
  LocalDownload,
  TaskFeedback,
  useLocalTask,
} from "./local-workbench";
import { readTextFile } from "../lib/local-files";
import {
  parseSubtitles,
  serializeSubtitles,
  shiftSubtitles,
  type SubtitleCue,
} from "../lib/subtitle-tools";
export default function SubtitleEditor() {
  const [raw, setRaw] = useState(""),
    [cues, setCues] = useState<SubtitleCue[]>([]),
    [format, setFormat] = useState<"srt" | "vtt">("srt"),
    [offset, setOffset] = useState("0"),
    [page, setPage] = useState(0);
  const task = useLocalTask<{ blob: Blob; name: string }>();
  function parseInput(text: string) {
    task.reset();
    setCues([]);
    try {
      const next = parseSubtitles(text);
      setCues(next);
      setPage(0);
    } catch (cause) {
      task.setError((cause as Error).message);
    }
  }
  function edit(index: number, field: "from" | "to" | "text", value: string) {
    task.reset();
    setCues((rows) =>
      rows.map((cue, i) =>
        i === index
          ? {
              ...cue,
              [field]:
                field === "text" ? value : Math.round(Number(value) * 1000),
            }
          : cue,
      ),
    );
  }
  return (
    <UtilityShell
      title="字幕编辑与转换"
      description="编辑 SRT / VTT 字幕、整体调整时间，导出转换后的字幕文件。"
    >
      <LocalUpload
        accept=".srt,.vtt"
        hint="SRT / VTT · 最大 32 MB · 最多 50000 条字幕"
        disabled={task.busy}
        onFiles={async (files) => {
          try {
            const text = await readTextFile(files[0], /\.(srt|vtt)$/i);
            setRaw(text);
            parseInput(text);
          } catch (cause) {
            task.setError((cause as Error).message);
          }
        }}
      />
      <section className="utility-panel utility-controls">
        <label>
          字幕原文
          <textarea
            aria-label="字幕原文"
            rows={5}
            maxLength={toolLimits.text.editorChars}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              task.reset();
              setCues([]);
            }}
          />
        </label>
        <button type="button" onClick={() => parseInput(raw)}>
          载入字幕原文
        </button>
        <p className="utility-muted">
          保留字幕文字与起止时间。WebVTT 的
          STYLE、NOTE、定位样式及复杂排版不会转入 SRT。
        </p>
      </section>
      {cues.length > 0 && (
        <>
          <section className="utility-panel utility-controls">
            <div className="workbench-fields">
              <label>
                整体偏移（毫秒，可为负数）
                <input
                  aria-label="字幕时间偏移"
                  type="number"
                  step="1"
                  value={offset}
                  onChange={(e) => setOffset(e.target.value)}
                />
              </label>
              <label>
                输出格式
                <select
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value as typeof format);
                    task.reset();
                  }}
                >
                  <option value="srt">SRT</option>
                  <option value="vtt">VTT</option>
                </select>
              </label>
            </div>
            <div className="utility-actions">
              <button
                type="button"
                onClick={() => {
                  task.reset();
                  try {
                    if (!offset.trim()) throw new Error("请输入偏移毫秒数。");
                    setCues(shiftSubtitles(cues, Number(offset)));
                  } catch (cause) {
                    task.setError((cause as Error).message);
                  }
                }}
              >
                应用整体偏移
              </button>
              <button
                type="button"
                onClick={() => {
                  task.reset();
                  setCues((rows) => [...rows].sort((a, b) => a.from - b.from));
                }}
              >
                按时间排序
              </button>
              <button
                type="button"
                onClick={() =>
                  void task.run(async () => ({
                    blob: new Blob([serializeSubtitles(cues, format)], {
                      type:
                        format === "vtt"
                          ? "text/vtt;charset=utf-8"
                          : "text/plain;charset=utf-8",
                    }),
                    name: `subtitles.${format}`,
                  }))
                }
              >
                生成字幕文件
              </button>
            </div>
          </section>
          <div className="workbench-cues">
            {cues.slice(page * 50, page * 50 + 50).map((cue, i) => (
              <section
                key={page * 50 + i}
                className="utility-panel utility-controls"
              >
                <h2>字幕 {page * 50 + i + 1}</h2>
                <div className="workbench-fields">
                  <label>
                    开始（秒）
                    <input
                      type="number"
                      step="0.001"
                      value={cue.from / 1000}
                      onChange={(e) =>
                        edit(page * 50 + i, "from", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    结束（秒）
                    <input
                      type="number"
                      step="0.001"
                      value={cue.to / 1000}
                      onChange={(e) =>
                        edit(page * 50 + i, "to", e.target.value)
                      }
                    />
                  </label>
                </div>
                <textarea
                  aria-label={`字幕 ${page * 50 + i + 1} 文字`}
                  rows={2}
                  maxLength={20000}
                  value={cue.text}
                  onChange={(e) => edit(page * 50 + i, "text", e.target.value)}
                />
              </section>
            ))}
          </div>
          <div className="utility-actions">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <span>
              {page + 1} / {Math.ceil(cues.length / 50)} · 共 {cues.length} 条
            </span>
            <button
              type="button"
              disabled={(page + 1) * 50 >= cues.length}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
      <TaskFeedback task={task} />
      {task.result && (
        <LocalDownload
          blob={task.result.blob}
          name={task.result.name}
          title="下载字幕"
        />
      )}
    </UtilityShell>
  );
}
