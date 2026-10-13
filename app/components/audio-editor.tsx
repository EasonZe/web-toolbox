"use client";
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
import {
  validateAudioTransformFile,
  encodeAudioBufferToWave,
} from "../lib/audio-transform";
import { runRasterWorker } from "../lib/raster-worker-client";
import type { AudioClip } from "../lib/audio-editing";
type Clip = AudioClip & { id: string; file: File; duration: number };
function ClipEditor({
  clip,
  index,
  count,
  busy,
  edit,
  move,
  remove,
}: {
  clip: Clip;
  index: number;
  count: number;
  busy: boolean;
  edit: (key: "start" | "end" | "fadeIn" | "fadeOut", value: number) => void;
  move: (step: number) => void;
  remove: () => void;
}) {
  const url = useBlobUrl(clip.file),
    audio = useRef<HTMLAudioElement>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    const player = audio.current;
    return () => player?.pause();
  }, []);
  const peaks = Array.from({ length: 120 }, (_, i) => {
    const values = clip.channels[0],
      start = Math.floor((values.length * i) / 120),
      end = Math.floor((values.length * (i + 1)) / 120);
    let peak = 0;
    for (
      let n = start;
      n < end;
      n += Math.max(1, Math.floor((end - start) / 30))
    )
      peak = Math.max(peak, Math.abs(values[n]));
    return peak;
  });
  return (
    <section className="utility-panel utility-controls">
      <h2>
        {index + 1}. {clip.file.name}
      </h2>
      <svg
        className="audio-edit-wave"
        viewBox="0 0 240 80"
        role="img"
        aria-label="音频波形"
      >
        {peaks.map((peak, i) => (
          <line
            key={i}
            x1={i * 2}
            x2={i * 2}
            y1={40 - peak * 38}
            y2={40 + peak * 38}
          />
        ))}
      </svg>
      <audio
        ref={audio}
        controls
        preload="metadata"
        src={url || undefined}
        onTimeUpdate={() => {
          if (audio.current && audio.current.currentTime >= clip.end)
            audio.current.pause();
        }}
      />
      <fieldset disabled={busy} className="workbench-fieldset">
        <div className="workbench-fields">
          {(["start", "end", "fadeIn", "fadeOut"] as const).map((key) => (
            <label key={key}>
              {
                {
                  start: "裁剪开始（秒）",
                  end: "裁剪结束（秒）",
                  fadeIn: "淡入（秒）",
                  fadeOut: "淡出（秒）",
                }[key]
              }
              <input
                aria-label={`片段 ${index + 1} ${key}`}
                type="number"
                min="0"
                max={clip.duration}
                step="0.01"
                value={clip[key]}
                onChange={(e) => edit(key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="utility-actions">
        <button
          type="button"
          onClick={async () => {
            if (!audio.current) return;
            audio.current.currentTime = clip.start;
            try {
              await audio.current.play();
            } catch {
              setMessage("浏览器无法播放此音频，但仍可尝试导出 WAV。");
            }
          }}
        >
          试听区间
        </button>
        <button
          type="button"
          disabled={busy || index === 0}
          onClick={() => move(-1)}
        >
          上移
        </button>
        <button
          type="button"
          disabled={busy || index === count - 1}
          onClick={() => move(1)}
        >
          下移
        </button>
        <button type="button" disabled={busy} onClick={remove}>
          移除
        </button>
      </div>
      <p className="utility-muted">
        原音频 {clip.duration.toFixed(2)} 秒 · 输出片段{" "}
        {Math.max(0, clip.end - clip.start).toFixed(2)} 秒
      </p>
      <p className="utility-muted" role="status">
        {message}
      </p>
    </section>
  );
}
export default function AudioEditor() {
  const [clips, setClips] = useState<Clip[]>([]),
    loading = useLocalTask<Clip[]>(),
    task = useLocalTask<Blob>(),
    busy = loading.busy || task.busy,
    output = useBlobUrl(task.result);
  function edit(
    index: number,
    key: "start" | "end" | "fadeIn" | "fadeOut",
    value: number,
  ) {
    task.reset();
    setClips((old) =>
      old.map((clip, i) => (i === index ? { ...clip, [key]: value } : clip)),
    );
  }
  function move(index: number, step: number) {
    task.reset();
    setClips((old) => {
      const next = [...old];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });
  }
  return (
    <UtilityShell
      title="音频裁剪与拼接"
      description="裁剪音频区间、多段顺序合并，添加淡入淡出并导出 WAV。"
    >
      <LocalUpload
        multiple
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
        disabled={busy}
        title="导入音频（可追加）"
        hint="最多 20 段 · 文件总大小 100 MB · 总采样点不超过 3000 万"
        onFiles={async (files) => {
          task.reset();
          const added = await loading.run(async (signal, report) => {
            checkFiles(
              [...clips.map((c) => c.file), ...files],
              100 * 1048576,
              20,
            );
            const context = new AudioContext({ sampleRate: 44100 });
            const abort = () => {
              void context.close().catch(() => {});
            };
            signal.addEventListener("abort", abort, { once: true });
            try {
              const next: Clip[] = [];
              let samples = clips.reduce(
                (sum, c) =>
                  sum + c.channels.reduce((n, ch) => n + ch.length, 0),
                0,
              );
              for (let i = 0; i < files.length; i++) {
                signal.throwIfAborted();
                const error = validateAudioTransformFile(files[i]);
                if (error) throw new Error(error);
                const { readAudioInfo } =
                  await import("../lib/audio-compression");
                const info = await readAudioInfo(files[i], signal);
                if (
                  info.duration > 600 ||
                  samples +
                    Math.ceil(info.duration * 44100) *
                      Math.min(2, info.channels) >
                    30_000_000
                )
                  throw new Error("音频时长或采样量超限，请裁剪后再导入。");
                const buffer = await context.decodeAudioData(
                  await files[i].arrayBuffer(),
                );
                signal.throwIfAborted();
                samples += buffer.length * Math.min(2, buffer.numberOfChannels);
                if (samples > 30_000_000 || buffer.duration > 600)
                  throw new Error("音频过长或采样点过多，请减少文件或时长。");
                next.push({
                  id: crypto.randomUUID(),
                  file: files[i],
                  duration: buffer.duration,
                  channels: Array.from(
                    { length: Math.min(2, buffer.numberOfChannels) },
                    (_, c) => buffer.getChannelData(c).slice(),
                  ),
                  sampleRate: buffer.sampleRate,
                  start: 0,
                  end: buffer.duration,
                  fadeIn: 0,
                  fadeOut: 0,
                });
                report(((i + 1) / files.length) * 95, "正在解码音频…");
              }
              return next;
            } finally {
              signal.removeEventListener("abort", abort);
              await context.close().catch(() => {});
            }
          });
          if (added) setClips([...clips, ...added]);
        }}
      />
      <p className="utility-muted">
        按列表顺序拼接。统一解码为 44.1
        kHz，最多保留两个声道；浏览器能解码的格式可用。淡入淡出作用于每个片段，不进行片段交叠。
      </p>
      <TaskFeedback task={loading} />
      {clips.map((clip, index) => (
        <ClipEditor
          key={clip.id}
          clip={clip}
          index={index}
          count={clips.length}
          busy={busy}
          edit={(key, value) => edit(index, key, value)}
          move={(step) => move(index, step)}
          remove={() => {
            task.reset();
            setClips((old) => old.filter((_, i) => i !== index));
          }}
        />
      ))}
      <button
        className="primary-button"
        type="button"
        disabled={!clips.length || busy}
        onClick={() =>
          void task.run(async (signal, report) => {
            const result = await runRasterWorker<{
              channels: Float32Array[];
              sampleRate: number;
              length: number;
            }>(
              {
                action: "audio",
                clips: clips.map(
                  ({ channels, sampleRate, start, end, fadeIn, fadeOut }) => ({
                    channels,
                    sampleRate,
                    start,
                    end,
                    fadeIn,
                    fadeOut,
                  }),
                ),
              },
              signal,
            );
            const buffer = new AudioBuffer({
              length: result.length,
              numberOfChannels: result.channels.length,
              sampleRate: result.sampleRate,
            });
            result.channels.forEach((channel, i) =>
              buffer.copyToChannel(new Float32Array(channel), i),
            );
            return encodeAudioBufferToWave(buffer, signal, (percent) =>
              report(percent, "正在生成 WAV…"),
            );
          })
        }
      >
        裁剪并合并音频
      </button>
      <TaskFeedback task={task} />
      {task.result && (
        <section className="utility-panel utility-controls">
          <h2>音频结果</h2>
          <audio controls src={output || undefined} />
          <LocalDownload
            blob={task.result}
            name="edited-audio.wav"
            title="下载 WAV 音频"
          />
        </section>
      )}
    </UtilityShell>
  );
}
