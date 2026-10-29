"use client";
/* eslint-disable @next/next/no-img-element -- Local raster preview uses a revocable Blob URL. */
import { useState } from "react";
import { toolLimits } from "../lib/resource-limits";
import { defaultOcrImageOptions, prepareOcrImage, type OcrImageOptions } from "../lib/ocr-image";
import { tidyChineseOcrSpacing, type OcrResult } from "../lib/ocr-text";
import { checkFiles, downloadLocal } from "../lib/local-files";
import { pixelsToPng } from "../lib/local-images";
import { recognizeImage } from "../lib/ocr-client";
import { UtilityShell } from "./utility-shell";
import { LocalUpload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";

export default function ImageOcr() {
  const [file, setFile] = useState<File | null>(null), [engine, setEngine] = useState("paddle"), [language, setLanguage] = useState<"eng" | "chi_sim" | "chi_sim+eng">("chi_sim+eng");
  const [text, setText] = useState(""), [copyStatus, setCopyStatus] = useState(""), [tidy, setTidy] = useState(true), [layout, setLayout] = useState<3 | 6 | 7 | 11>(11);
  const [options, setOptions] = useState<OcrImageOptions>(defaultOcrImageOptions), [uploadKey, setUploadKey] = useState(0);
  const task = useLocalTask<OcrResult & { width: number; height: number; actualScale: number }>(), preview = useBlobUrl(file);
  function resetResult() { task.reset(); setText(""); setCopyStatus(""); }
  function updateOptions(value: Partial<OcrImageOptions>) { resetResult(); setOptions((previous) => ({ ...previous, ...value })); }
  const downloadText = (value: string, name: string) => downloadLocal(new Blob([value], { type: "text/plain;charset=utf-8" }), name);
  return <UtilityShell className="additional-utilities" title="图片文字识别 OCR" description="本地识别中英文，支持范围裁剪、旋转、小字放大与原始结果保留；图片不上传。">
    <LocalUpload key={uploadKey} accept="image/png,image/jpeg,image/webp,image/bmp" hint="PNG / JPG / WebP / BMP · 最大 100 MB · 最多 100 MP；工作图按设备预算缩放，并显示实际尺寸。" onFiles={(files) => {
      resetResult(); setFile(null); setOptions(defaultOcrImageOptions);
      try { checkFiles(files, toolLimits.image.fileBytes, 1); setFile(files[0]); } catch (cause) { task.setError((cause as Error).message); }
    }} />
    <div className="workbench-two"><section className="utility-panel utility-controls"><h2>图片预览</h2>
      {preview ? <div className="ocr-source-preview"><div className="ocr-source-image"><img className="workbench-image" src={preview} alt="待识别图片" /><span aria-hidden="true" style={{ left: `${options.left}%`, top: `${options.top}%`, width: `${options.width}%`, height: `${options.height}%` }} /></div></div> : <div className="utility-empty">选择图片后可预览</div>}
      <label>识别引擎<select value={engine} onChange={(e) => { resetResult(); setEngine(e.target.value); }}><option value="paddle">PaddleOCR · 中文截图 / 中英混排</option><option value="tesseract">Tesseract · 兼容模式</option></select></label>
      <label>识别语言<select disabled={engine === "paddle"} value={engine === "paddle" ? "chi_sim+eng" : language} onChange={(e) => { resetResult(); setLanguage(e.target.value as typeof language); }}><option value="chi_sim+eng">简体中文 + 英文</option><option value="chi_sim">简体中文</option><option value="eng">英文</option></select></label>
      {engine === "tesseract" && <>
        <label>文字布局<select value={layout} onChange={(e) => { resetResult(); setLayout(Number(e.target.value) as typeof layout); }}><option value={11}>散排文字 / 截图</option><option value={3}>自动页面</option><option value={6}>单个文本块</option><option value={7}>单行文字</option></select></label></>}
      <details><summary>范围与图像处理</summary><div className="ocr-option-grid">
        {(["left", "top", "width", "height"] as const).map((key, i) => <label key={key}>{["左侧位置 %", "顶部位置 %", "范围宽度 %", "范围高度 %"][i]}<input type="number" min={0} max={100} step="any" value={options[key]} onChange={(e) => updateOptions({ [key]: Number(e.target.value) })} /></label>)}
        <label>旋转<select value={options.rotation} onChange={(e) => updateOptions({ rotation: Number(e.target.value) as OcrImageOptions["rotation"] })}>{[0, 90, 180, 270].map((n) => <option key={n} value={n}>{n}°</option>)}</select></label>
        <label>小字放大<select value={options.scale} onChange={(e) => updateOptions({ scale: Number(e.target.value) as OcrImageOptions["scale"] })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}×</option>)}</select></label>
        <label>图像处理<select value={options.filter} onChange={(e) => updateOptions({ filter: e.target.value as OcrImageOptions["filter"] })}><option value="original">原图颜色</option><option value="grayscale">灰度</option><option value="invert">反色（深底浅字）</option></select></label>
      </div><p className="utility-muted">先裁剪再放大，超出设备预算会缩放工作图并显示实际尺寸，不改变原文件。旋转用于手动校正方向，不自动纠正透视。</p></details>
      <label className="ocr-spacing-option"><input type="checkbox" checked={tidy} onChange={(e) => setTidy(e.target.checked)} />下次识别整理中文单空格（保留原始结果）</label>
      <div className="utility-actions"><button className="primary-button" type="button" disabled={!file || task.busy} onClick={async () => {
        if (!file) return; const tidyOutput = tidy; setText(""); setCopyStatus("");
        const result = await task.run(async (signal, report) => {
          report(1, "正在裁剪与准备识别图像…"); const prepared = await prepareOcrImage(file, options, signal); signal.throwIfAborted();
          const recognized = engine === "paddle" ? await (await import("../lib/paddle-ocr-client")).recognizeWithPaddle(prepared.image, signal, report)
            : await recognizeImage(await pixelsToPng(prepared.image.data, prepared.image.width, prepared.image.height), language, signal, report, layout);
          return { ...recognized, width: prepared.image.width, height: prepared.image.height, actualScale: prepared.actualScale };
        });
        if (result) setText(tidyOutput ? tidyChineseOcrSpacing(result.text) : result.text);
      }}>开始识别</button><button type="button" onClick={() => { resetResult(); setFile(null); setOptions(defaultOcrImageOptions); setUploadKey((value) => value + 1); }}>清空</button></div>
      <p className="utility-muted">首次识别按需加载站内引擎与模型。PaddleOCR 使用中英文通用模型；兼容引擎可选择语言和布局。两者的分数口径不同，不能直接比较。</p>
      <p className="utility-muted">复杂表格、手写、艺术字、透视照片和模糊小字仍可能出错。中文间距整理是可选文本处理，不恢复漏字；多空格、缩进和换行保留，请核对重要内容。</p>
    </section><section className="utility-panel utility-controls"><h2>识别文字</h2>
      <textarea aria-label="OCR 识别文字" rows={20} value={text} disabled={task.busy} onChange={(e) => setText(e.target.value)} />
      {task.result && <p className="utility-muted">{task.result.engine ?? "Tesseract"} · 引擎平均分 {task.result.confidence.toFixed(1)}%（不是准确率） · 工作图 {task.result.width}×{task.result.height}px · 实际缩放 {task.result.actualScale.toFixed(2)}×{!task.result.text.trim() ? " · 未识别到文字，请调整范围、方向或引擎。" : ""}</p>}
      <div className="utility-actions"><button type="button" disabled={!text || task.busy} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopyStatus("已复制。"); } catch { setCopyStatus("无法访问剪贴板，请手动复制。"); } }}>复制文字</button>
        <button type="button" disabled={!text || task.busy} onClick={() => downloadText(text, "ocr-text.txt")}>导出 TXT</button><button type="button" disabled={!text || task.busy} onClick={() => setText(tidyChineseOcrSpacing(text))}>整理当前中文间距</button></div>
      <p className="utility-muted" role="status">{copyStatus}</p>
      {task.result && <details><summary>原始识别结果（未经间距整理）</summary><textarea aria-label="OCR 原始识别文字" readOnly rows={10} value={task.result.text} /><button type="button" onClick={() => downloadText(task.result!.text, "ocr-raw.txt")}>导出原始 TXT</button></details>}
    </section></div><TaskFeedback task={task} />
  </UtilityShell>;
}
