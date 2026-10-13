"use client";
/* eslint-disable @next/next/no-img-element -- All previews are local Blob URLs. */
import { useState, type CSSProperties } from "react";
import { UtilityShell } from "./utility-shell";
import {
  LocalUpload,
  LocalDownload,
  TaskFeedback,
  useBlobUrl,
  useLocalTask,
} from "./local-workbench";
import { loadRaster, rasterPixels, pixelsToPng } from "../lib/local-images";
import { runRasterWorker } from "../lib/raster-worker-client";

export function SeamlessChecker() {
  const [file, setFile] = useState<File | null>(null),
    [zoom, setZoom] = useState(100),
    [grid, setGrid] = useState(true),
    [size, setSize] = useState({ width: 256, height: 256 });
  const task = useLocalTask<{ width: number; height: number }>(),
    url = useBlobUrl(file);
  const width = (size.width * zoom) / 100,
    height = (size.height * zoom) / 100;
  return (
    <UtilityShell
      title="无缝贴图检查器"
      description="重复平铺贴图、缩放查看，使用接缝辅助线检查边缘。"
    >
      <LocalUpload
        accept="image/png,image/jpeg,image/webp,image/avif,image/bmp"
        disabled={task.busy}
        hint="最大 25 MB · 最多 16 MP"
        onFiles={async (files) => {
          setFile(null);
          const result = await task.run(async (signal) => {
            const bitmap = await loadRaster(files[0], signal);
            try {
              return { width: bitmap.width, height: bitmap.height };
            } finally {
              bitmap.close();
            }
          });
          if (result) {
            setFile(files[0]);
            setSize(result);
            setZoom(
              Math.min(
                100,
                Math.max(
                  1,
                  Math.round(
                    (160 / Math.max(result.width, result.height)) * 100,
                  ),
                ),
              ),
            );
          }
        }}
      />
      <section className="utility-panel utility-controls">
        <label className="utility-range-control">
          <span>
            缩放<output>{zoom}%</output>
          </span>
          <input
            aria-label="贴图缩放"
            type="range"
            min="1"
            max="300"
            step="1"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <label className="utility-checkbox">
          <input
            type="checkbox"
            checked={grid}
            onChange={(e) => setGrid(e.target.checked)}
          />
          显示接缝辅助线
        </label>
        <p className="utility-muted">
          原图 {size.width} × {size.height} · 平铺尺寸 {Math.round(width)} ×{" "}
          {Math.round(height)} · 辅助线只用于观察，不修改图片。
        </p>
      </section>
      <div
        className="seamless-preview"
        aria-label="重复平铺预览"
        style={{
          backgroundImage: url ? `url("${url}")` : undefined,
          backgroundSize: `${width}px ${height}px`,
        }}
      >
        {!url && <p>选择图片后查看重复平铺效果</p>}
        {url && grid && (
          <div
            className="seamless-grid"
            style={
              {
                "--tile-width": `${width}px`,
                "--tile-height": `${height}px`,
              } as CSSProperties
            }
          />
        )}
      </div>
      <TaskFeedback task={task} />
    </UtilityShell>
  );
}
type Slot = {
  file: File | null;
  channel: number | "luma";
  invert: boolean;
  constant: number;
};
export function ChannelPacker() {
  const [slots, setSlots] = useState<Slot[]>(() =>
      [0, 1, 2, 3].map((channel) => ({
        file: null,
        channel,
        invert: false,
        constant: channel === 3 ? 255 : 0,
      })),
    ),
    [width, setWidth] = useState(1024),
    [height, setHeight] = useState(1024);
  const task = useLocalTask<Blob>(),
    preview = useBlobUrl(task.result);
  function change(index: number, patch: Partial<Slot>) {
    task.reset();
    setSlots((old) =>
      old.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  }
  return (
    <UtilityShell
      title="贴图通道打包"
      description="自定义 RGBA 通道来源，反转通道，预览并导出 PNG。"
    >
      <div className="workbench-fields utility-controls">
        <label>
          输出宽度
          <input
            aria-label="通道输出宽度"
            type="number"
            min="1"
            max="4096"
            disabled={task.busy}
            value={width}
            onChange={(e) => {
              task.reset();
              setWidth(Number(e.target.value));
            }}
          />
        </label>
        <label>
          输出高度
          <input
            aria-label="通道输出高度"
            type="number"
            min="1"
            max="4096"
            disabled={task.busy}
            value={height}
            onChange={(e) => {
              task.reset();
              setHeight(Number(e.target.value));
            }}
          />
        </label>
      </div>
      <div className="channel-slot-grid">
        {slots.map((slot, i) => (
          <section className="utility-panel utility-controls" key={i}>
            <h2>{["R · 红色", "G · 绿色", "B · 蓝色", "A · 透明度"][i]}</h2>
            <LocalUpload
              accept="image/png,image/jpeg,image/webp,image/bmp,image/avif"
              disabled={task.busy}
              title={slot.file?.name ?? "选择通道来源图片"}
              hint="最大 25 MB · 最多 16 MP"
              onFiles={(files) => change(i, { file: files[0] })}
            />
            <label>
              来源通道
              <select
                value={slot.channel}
                disabled={task.busy}
                onChange={(e) =>
                  change(i, {
                    channel:
                      e.target.value === "luma"
                        ? "luma"
                        : Number(e.target.value),
                  })
                }
              >
                <option value="0">R</option>
                <option value="1">G</option>
                <option value="2">B</option>
                <option value="3">A</option>
                <option value="luma">亮度</option>
              </select>
            </label>
            {!slot.file && (
              <label>
                常量（0–255）
                <input
                  type="number"
                  min="0"
                  max="255"
                  disabled={task.busy}
                  value={slot.constant}
                  onChange={(e) =>
                    change(i, { constant: Number(e.target.value) })
                  }
                />
              </label>
            )}
            <label className="utility-checkbox">
              <input
                type="checkbox"
                disabled={task.busy}
                checked={slot.invert}
                onChange={(e) => change(i, { invert: e.target.checked })}
              />
              反转通道
            </label>
            {slot.file && (
              <button
                type="button"
                disabled={task.busy}
                onClick={() => change(i, { file: null })}
              >
                使用常量代替
              </button>
            )}
          </section>
        ))}
      </div>
      <p className="utility-muted">
        图片将缩放到输出尺寸；没有图片的通道使用常量。适合
        ORM、遮罩和自定义通道贴图。这里处理的是 8
        位通道，不进行额外颜色空间转换。
      </p>
      <button
        className="primary-button"
        type="button"
        disabled={task.busy}
        onClick={() =>
          void task.run(async (signal, report) => {
            if (
              !Number.isInteger(width) ||
              !Number.isInteger(height) ||
              width < 1 ||
              height < 1 ||
              width > 4096 ||
              height > 4096
            )
              throw new Error("输出宽高须为 1–4096 的整数。");
            const channels = [];
            for (let i = 0; i < slots.length; i++) {
              const slot = slots[i];
              signal.throwIfAborted();
              const pixels = slot.file
                ? (await rasterPixels(slot.file, signal, width, height)).data
                : null;
              channels.push({
                pixels,
                channel: slot.channel,
                invert: slot.invert,
                constant: slot.constant,
              });
              report((i / 4) * 50, "正在读取通道图片…");
            }
            const result = await runRasterWorker<Uint8ClampedArray>(
              { action: "pack", width, height, channels },
              signal,
            );
            return pixelsToPng(result, width, height);
          })
        }
      >
        打包 RGBA 通道
      </button>
      <TaskFeedback task={task} />
      {task.result && (
        <section className="utility-panel utility-controls">
          <h2>打包预览</h2>
          <img
            className="workbench-image checkerboard"
            src={preview}
            alt="RGBA 通道打包结果"
          />
          <LocalDownload
            blob={task.result}
            name="packed-rgba.png"
            title="导出 PNG"
          />
        </section>
      )}
    </UtilityShell>
  );
}
export function HeightNormal() {
  const [file, setFile] = useState<File | null>(null),
    [strength, setStrength] = useState(3),
    [flipX, setFlipX] = useState(false),
    [flipY, setFlipY] = useState(false),
    [wrap, setWrap] = useState(true);
  const task = useLocalTask<Blob>(),
    source = useBlobUrl(file),
    output = useBlobUrl(task.result);
  return (
    <UtilityShell
      title="高度图转法线图"
      description="从高度图生成切线空间法线图，调节强度与方向，导出 PNG。"
    >
      <LocalUpload
        accept="image/png,image/jpeg,image/webp,image/bmp"
        disabled={task.busy}
        hint="最大 25 MB · 最多 16 MP · 输出保留原图尺寸"
        onFiles={(files) => {
          task.reset();
          setFile(files[0]);
        }}
      />
      <div className="workbench-two">
        <section className="utility-panel utility-controls">
          <h2>高度图</h2>
          {source ? (
            <img className="workbench-image" src={source} alt="原始高度图" />
          ) : (
            <div className="utility-empty">选择高度图后生成法线图</div>
          )}
          <label className="utility-range-control">
            <span>
              强度<output>{strength.toFixed(1)}</output>
            </span>
            <input
              aria-label="法线强度"
              type="range"
              min="0.1"
              max="20"
              step="0.1"
              disabled={task.busy}
              value={strength}
              onChange={(e) => {
                task.reset();
                setStrength(Number(e.target.value));
              }}
            />
          </label>
          {(["flipX", "flipY", "wrap"] as const).map((key) => (
            <label key={key} className="utility-checkbox">
              <input
                type="checkbox"
                disabled={task.busy}
                checked={{ flipX, flipY, wrap }[key]}
                onChange={(e) => {
                  task.reset();
                  ({ flipX: setFlipX, flipY: setFlipY, wrap: setWrap })[key](
                    e.target.checked,
                  );
                }}
              />
              {
                {
                  flipX: "反转 X / 红色方向",
                  flipY: "反转 Y / 绿色方向",
                  wrap: "边缘循环采样（无缝贴图）",
                }[key]
              }
            </label>
          ))}
          <button
            className="primary-button"
            type="button"
            disabled={!file || task.busy}
            onClick={() =>
              void task.run(async (signal) => {
                const image = await rasterPixels(file!, signal);
                const pixels = await runRasterWorker<Uint8ClampedArray>(
                  {
                    action: "normal",
                    pixels: image.data,
                    width: image.width,
                    height: image.height,
                    strength,
                    flipX,
                    flipY,
                    wrap,
                  },
                  signal,
                );
                return pixelsToPng(pixels, image.width, image.height);
              })
            }
          >
            生成法线图
          </button>
          <p className="utility-muted">
            按 RGB 亮度读取高度，使用 Sobel
            梯度。绿色通道可反转以适配不同引擎，导入时请选择法线贴图 /
            非颜色数据。
          </p>
        </section>
        <section className="utility-panel utility-controls">
          <h2>法线图预览</h2>
          {task.result ? (
            <>
              <img
                className="workbench-image"
                src={output}
                alt="生成的法线图"
              />
              <LocalDownload
                blob={task.result}
                name="normal-map.png"
                title="导出 PNG"
              />
            </>
          ) : (
            <div className="utility-empty">生成后可预览与导出</div>
          )}
        </section>
      </div>
      <TaskFeedback task={task} />
    </UtilityShell>
  );
}
