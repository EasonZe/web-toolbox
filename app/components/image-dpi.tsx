"use client";
import { useState } from "react";
import { inspectImageDpi, setImageDpi } from "../lib/image-dpi";
import { toolLimits } from "../lib/resource-limits";
import { checkFiles } from "../lib/local-files";
import { LocalUpload, LocalDownload, TaskFeedback, useLocalTask } from "./local-workbench";
import { UtilityShell } from "./utility-shell";
export default function ImageDpi() {
  const [dpi, setDpi] = useState(300);
  const source = useLocalTask<{ file: File; data: Uint8Array; info: ReturnType<typeof inspectImageDpi> }>(), output = useLocalTask<Blob>();
  const current = source.result;
  return <UtilityShell className="additional-utilities" title="图片 DPI 修改" description="直接修改 PNG / JPEG 分辨率元数据，不重新编码、不改变像素尺寸。">
    <LocalUpload accept="image/png,image/jpeg" title="选择 PNG / JPEG 图片" hint="最多 100 MB · 本地修改，不上传文件" onFiles={async (files) => {
      output.reset(); await source.run(async (signal) => { checkFiles(files, toolLimits.image.fileBytes, 1); const data = new Uint8Array(await files[0].arrayBuffer()); signal.throwIfAborted(); return { file: files[0], data, info: inspectImageDpi(data) }; });
    }} /><TaskFeedback task={source} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>目标分辨率</h2><label>DPI<input type="number" min="1" max="65535" step="1" value={dpi} onChange={(e) => { output.reset(); setDpi(Number(e.target.value)); }} /></label>
      <div className="utility-actions">{[72, 96, 150, 300, 600].map((value) => <button key={value} type="button" aria-pressed={value === dpi} onClick={() => { output.reset(); setDpi(value); }}>{value} DPI</button>)}</div>
      <p className="utility-muted">DPI 决定标称打印尺寸，不会增加细节、放大图片或压缩文件。图片中已有的分辨率标记会同步更新。</p>
      <button className="primary-button" type="button" disabled={!current || output.busy} onClick={() => current && void output.run(async (signal) => { signal.throwIfAborted(); return setImageDpi(current.data, dpi); })}>应用 DPI</button><TaskFeedback task={output} />
      {output.result && current && <LocalDownload blob={output.result} name={`${current.file.name.replace(/\.[^.]+$/, "")}-${dpi}dpi.${current.info.mime === "image/png" ? "png" : "jpg"}`} title="下载修改后的图片" />}
    </section><section className="utility-panel utility-controls"><h2>图片信息</h2>{current ? <>
      <p className="utility-code-output">{current.file.name}</p><dl className="workbench-details"><dt>像素尺寸</dt><dd>{current.info.width} × {current.info.height}</dd><dt>原水平 DPI</dt><dd>{current.info.x?.toFixed(2) ?? "未指定"}</dd><dt>原垂直 DPI</dt><dd>{current.info.y?.toFixed(2) ?? "未指定"}</dd><dt>目标打印尺寸</dt><dd>{Number.isFinite(dpi) && dpi > 0 ? `${(current.info.width / dpi * 2.54).toFixed(2)} × ${(current.info.height / dpi * 2.54).toFixed(2)} cm` : "请输入有效 DPI"}</dd></dl>
      <p className="utility-muted">原图的压缩像素、方向与其他元数据保留不变。图片没有 DPI 标记时显示“未指定”，不会假定为 72 或 96。</p>
    </> : <div className="utility-empty">导入图片后查看尺寸与原 DPI</div>}</section></div>
  </UtilityShell>;
}
