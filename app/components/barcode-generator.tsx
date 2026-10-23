"use client";
/* eslint-disable @next/next/no-img-element -- Generated local barcode Blob preview. */
import { useState } from "react";
import { barcodeFormats, barcodeExamples, barcodeOptions, type BarcodeFormat } from "../lib/barcode";
import { UtilityShell } from "./utility-shell";
import { LocalDownload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";

export default function BarcodeGenerator() {
  const [format, setFormat] = useState<BarcodeFormat>("CODE128"), [value, setValue] = useState("EASON-2026"), [height, setHeight] = useState(100), [width, setWidth] = useState(2), [displayValue, setDisplayValue] = useState(true);
  const task = useLocalTask<{ svg: Blob; png: Blob }>(), preview = useBlobUrl(task.result?.svg);
  async function generate() {
    await task.run(async (signal) => {
      const options = barcodeOptions(value, format, height, width, displayValue);
      const { default: JsBarcode } = await import("jsbarcode"); signal.throwIfAborted();
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), canvas = document.createElement("canvas");
      try {
        JsBarcode(svg, value, options); JsBarcode(canvas, value, options);
        const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
        const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 导出失败。")), "image/png"));
        signal.throwIfAborted(); return { svg: svgBlob, png };
      } finally { canvas.width = 0; canvas.height = 0; }
    });
  }
  return <UtilityShell className="additional-utilities" title="条形码生成" description="生成 Code 128、Code 39、EAN、UPC 和 ITF-14 条形码，导出 SVG 或 PNG。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>条码设置</h2>
      <label>条码格式<select value={format} onChange={(e) => { task.reset(); setFormat(e.target.value as BarcodeFormat); }}>{barcodeFormats.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>条码内容<input value={value} maxLength={256} spellCheck={false} onChange={(e) => { task.reset(); setValue(e.target.value); }} /></label>
      <button type="button" onClick={() => { task.reset(); setValue(barcodeExamples[format]); }}>填入此格式示例</button>
      <label className="utility-range-control"><span>条码高度<output>{height}px</output></span><input type="range" min="40" max="300" value={height} onChange={(e) => { task.reset(); setHeight(Number(e.target.value)); }} /></label>
      <label>条宽<select value={width} onChange={(e) => { task.reset(); setWidth(Number(e.target.value)); }}>{[1, 2, 3, 4].map((size) => <option key={size} value={size}>{size}px</option>)}</select></label>
      <label className="utility-checkbox"><input type="checkbox" checked={displayValue} onChange={(e) => { task.reset(); setDisplayValue(e.target.checked); }} />显示条码文字</label>
      <button className="primary-button" type="button" disabled={task.busy} onClick={() => void generate()}>生成条形码</button>
      <p className="utility-muted">EAN / UPC / ITF-14 会检查校验位；缺少校验位时可自动补齐。示例商品码仅供测试，生成条码不代表获得商品编码授权。</p><TaskFeedback task={task} />
    </section><section className="utility-panel utility-controls"><h2>条码预览</h2>{preview ? <div className="barcode-preview"><img src={preview} alt={`${format} 条形码预览`} /></div> : <div className="utility-empty">生成后显示预览</div>}
      <p className="utility-muted">条码保持黑条白底，避免主题色影响识别。长条码可横向滑动查看。</p>
      {task.result && <><LocalDownload blob={task.result.svg} name="barcode.svg" title="下载 SVG" /><LocalDownload blob={task.result.png} name="barcode.png" title="下载 PNG" /></>}
    </section></div>
  </UtilityShell>;
}
