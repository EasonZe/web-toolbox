"use client";
import { useState } from "react";
import { UtilityShell } from "./utility-shell";
import { useLocalTask, TaskFeedback } from "./local-workbench";
import {
  commonTimeZones,
  dateToTimestamp,
  timestampResult,
} from "../lib/timestamp-tools";
export default function TimestampConverter() {
  const [value, setValue] = useState(""),
    [date, setDate] = useState(""),
    [unit, setUnit] = useState<"seconds" | "milliseconds">("seconds"),
    [zone, setZone] = useState("Asia/Shanghai");
  const task = useLocalTask<ReturnType<typeof timestampResult>>();
  function reset() {
    task.reset();
  }
  return (
    <UtilityShell
      title="时间戳转换"
      description="秒、毫秒、日期与 IANA 时区相互转换，精确到毫秒。"
    >
      <section className="utility-panel utility-controls">
        <label>
          时区
          <input
            aria-label="转换时区"
            list="timestamp-zones"
            value={zone}
            onChange={(e) => {
              setZone(e.target.value);
              reset();
            }}
          />
          <datalist id="timestamp-zones">
            {commonTimeZones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </label>
        <p className="utility-muted">
          可输入任意有效 IANA
          时区。时间戳本身不带时区；夏令时重复时段采用库的默认偏移，请核对结果中的
          UTC 偏移。
        </p>
      </section>
      <div className="workbench-two">
        <section className="utility-panel utility-controls">
          <h2>时间戳 → 日期</h2>
          <label>
            时间戳
            <input
              aria-label="时间戳"
              inputMode="decimal"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                reset();
              }}
            />
          </label>
          <label>
            单位
            <select
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value as typeof unit);
                reset();
              }}
            >
              <option value="seconds">秒</option>
              <option value="milliseconds">毫秒</option>
            </select>
          </label>
          <div className="utility-actions">
            <button
              type="button"
              onClick={() =>
                void task.run(async () => timestampResult(value, unit, zone))
              }
            >
              转换为日期
            </button>
            <button
              type="button"
              onClick={() => {
                const now = Date.now();
                setUnit("milliseconds");
                setValue(String(now));
                void task.run(async () =>
                  timestampResult(String(now), "milliseconds", zone),
                );
              }}
            >
              当前时间
            </button>
          </div>
        </section>
        <section className="utility-panel utility-controls">
          <h2>日期 → 时间戳</h2>
          <label>
            所选时区的日期与时间
            <input
              aria-label="日期与时间"
              type="datetime-local"
              step="0.001"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                reset();
              }}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              void task.run(async () => dateToTimestamp(date, zone))
            }
          >
            转换为时间戳
          </button>
        </section>
      </div>
      <TaskFeedback task={task} />
      {task.result && (
        <section className="utility-panel">
          <h2>转换结果</h2>
          <dl className="workbench-details">
            <dt>秒</dt>
            <dd>{task.result.seconds}</dd>
            <dt>毫秒</dt>
            <dd>{task.result.milliseconds}</dd>
            <dt>{zone}</dt>
            <dd>{task.result.date}</dd>
            <dt>UTC</dt>
            <dd>{task.result.utc}</dd>
          </dl>
        </section>
      )}
    </UtilityShell>
  );
}
