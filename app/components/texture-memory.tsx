"use client";
import { useState } from "react";
import { estimateTextureMemory, formatTextureBytes, fullTextureMipLevels, positiveTextureInteger, textureFormats, type TextureMemoryOptions, type TextureMemoryResult } from "../lib/texture-memory";
import { UtilityShell } from "./utility-shell";
import { TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityResult } from "./text-utility-parts";

export default function TextureMemory() {
  const [width, setWidth] = useState("2048"), [height, setHeight] = useState("2048"), [count, setCount] = useState("1"), [layers, setLayers] = useState("1"), [levels, setLevels] = useState("1");
  const [kind, setKind] = useState<TextureMemoryOptions["kind"]>("2d"), [format, setFormat] = useState("rgba8"), [mipmaps, setMipmaps] = useState<TextureMemoryOptions["mipmaps"]>("full");
  const task = useLocalTask<TextureMemoryResult>();
  let maximum = "—"; try { maximum = String(fullTextureMipLevels(positiveTextureInteger(width, "宽度"), positiveTextureInteger(height, "高度"))); } catch { /* Invalid input is reported on explicit calculation. */ }
  return <UtilityShell className="additional-utilities" title="贴图显存估算" description="按纹理格式、尺寸、层数和 Mipmap 逐级计算纹理数据量，支持 BC、ETC2 与 ASTC 块压缩。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>贴图设置</h2>
      <div className="texture-number-grid">{([["宽度（像素）", width, setWidth], ["高度（像素）", height, setHeight], ["同规格贴图数量", count, setCount]] as const).map(([label, value, update]) => <label key={label}>{label}<input inputMode="numeric" value={value} maxLength={16} onChange={(event) => { task.reset(); update(event.target.value); }} /></label>)}</div>
      <label>纹理格式<select value={format} onChange={(event) => { task.reset(); setFormat(event.target.value); }}>{textureFormats.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
      <label>贴图类型<select value={kind} onChange={(event) => { task.reset(); setKind(event.target.value as TextureMemoryOptions["kind"]); setLayers("1"); }}><option value="2d">普通 2D 贴图</option><option value="array">2D 纹理阵列</option><option value="cube">立方体贴图（6 个面）</option></select></label>
      {kind === "array" && <label>每张阵列的层数<input inputMode="numeric" value={layers} maxLength={16} onChange={(event) => { task.reset(); setLayers(event.target.value); }} /></label>}
      <label>Mipmap<select value={mipmaps} onChange={(event) => { task.reset(); setMipmaps(event.target.value as TextureMemoryOptions["mipmaps"]); }}><option value="none">仅原图，无 Mipmap</option><option value="full">完整 Mipmap 链</option><option value="custom">指定层级数</option></select></label>
      {mipmaps === "custom" && <label>层级数（包含原图）<input inputMode="numeric" value={levels} maxLength={2} onChange={(event) => { task.reset(); setLevels(event.target.value); }} /></label>}
      <p className="utility-muted">当前尺寸最多 {maximum} 级。每一级尺寸向下取整、最低为 1；压缩纹理的每一级块数单独向上取整，不使用固定 4/3 近似。</p>
      <button type="button" className="primary-button" disabled={task.busy} onClick={() => void task.run(async () => estimateTextureMemory({ width: positiveTextureInteger(width, "宽度"), height: positiveTextureInteger(height, "高度"), count: positiveTextureInteger(count, "数量"), layers: positiveTextureInteger(layers, "层数"), kind, format, mipmaps, levels: mipmaps === "custom" ? positiveTextureInteger(levels, "层级数") : 1 }))}>计算纹理数据量</button>
      <TaskFeedback task={task} />
      <p className="utility-muted">这是理论纹理载荷，不是 PNG / JPG / KTX 文件大小，也不是驱动实际分配保证。硬件支持、行对齐、内存页、格式转存及引擎保留的 CPU 副本可能增加占用。</p>
      <p className="utility-muted">不验证设备支持的纹理尺寸或格式；不含 3D 体积纹理、MSAA、深度缓冲和纹理流送。sRGB 与线性编码在相同格式下的数据量相同。</p>
    </section><section className="utility-panel utility-controls"><h2>估算结果</h2>{task.result ? <>
      <output className="unit-conversion-result" aria-live="polite">{formatTextureBytes(task.result.totalBytes)}</output>
      <dl className="network-detail-list"><div><dt>精确字节数</dt><dd>{task.result.totalBytes} B</dd></div><div><dt>原图合计</dt><dd>{formatTextureBytes(task.result.baseBytes)}</dd></div><div><dt>Mipmap 增量</dt><dd>{formatTextureBytes(task.result.mipBytes)}</dd></div><div><dt>单张含层 / 面</dt><dd>{formatTextureBytes(task.result.textureBytes)}</dd></div><div><dt>实际层级</dt><dd>{task.result.mipLevels} 级 × {task.result.options.layers} 层 × {task.result.faces} 面 × {task.result.options.count} 张</dd></div></dl>
      <div className="table-data-preview"><table><caption>逐级数据量（合计包含数量、层和面）</caption><thead><tr><th>级</th><th>尺寸</th><th>块数</th><th>合计字节</th></tr></thead><tbody>{task.result.rows.map((row) => <tr key={row.level}><td>{row.level}</td><td>{row.width} × {row.height}</td><td>{row.blocksX} × {row.blocksY}</td><td>{row.totalBytes}</td></tr>)}</tbody></table></div>
      <TextUtilityResult key={JSON.stringify(task.result)} text={JSON.stringify(task.result, null, 2)} name="texture-memory.json" mime="application/json" />
    </> : <p className="utility-muted">输入目标格式后计算。块压缩按实际块大小计算；1×1 的 BC1 Mipmap 仍占一个 8 字节块。</p>}</section></div>
  </UtilityShell>;
}
