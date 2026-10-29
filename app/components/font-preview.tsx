"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFontPreviewSession, fontPreviewSettings, type FontPreviewEntry } from "../lib/font-preview";
import { toolLimits } from "../lib/resource-limits";
import { fileSize } from "../lib/local-files";
import { UtilityShell } from "./utility-shell";
import { LocalUpload, TaskFeedback, useLocalTask } from "./local-workbench";

export default function FontPreview() {
  const [text, setText] = useState("生活明朗，万物可爱。\nThe quick brown fox jumps over the lazy dog.\n0123456789 !? @#%&"), [size, setSize] = useState("32"), [weight, setWeight] = useState("400"), [uploadKey, setUploadKey] = useState(0);
  const owner = useRef<ReturnType<typeof createFontPreviewSession> | null>(null), task = useLocalTask<FontPreviewEntry[]>();
  useEffect(() => () => { owner.current?.dispose(); owner.current = null; }, []);
  const settings = useMemo(() => { try { return { value: fontPreviewSettings(size, weight), error: "" }; } catch (cause) { return { value: null, error: cause instanceof Error ? cause.message : "预览参数无效。" }; } }, [size, weight]);
  const clear = () => { task.reset(); owner.current?.dispose(); owner.current = null; setUploadKey((value) => value + 1); };
  return <UtilityShell className="additional-utilities" title="本地字体预览" description="拖入字体文件，预览中英文与数字；仅在当前页面临时加载，不安装字体、不读取系统字体列表。">
    <LocalUpload key={uploadKey} multiple accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" title="选择字体 / 拖入 TTF、OTF、WOFF、WOFF2" hint="最多 8 个，每个 64 MiB，总计 128 MiB；按字体声明的解压大小检查额外预算。" onFiles={(files) => {
      task.reset(); owner.current?.dispose(); owner.current = null;
      void task.run(async (signal, report) => { const session = createFontPreviewSession(); owner.current = session; return session.load(files, signal, report); });
    }} />
    <TaskFeedback task={task} />
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>预览设置</h2>
      <label>预览文字<textarea rows={6} value={text} maxLength={toolLimits.fontPreview.previewChars} onChange={(event) => setText(event.target.value)} /></label>
      <p className="utility-muted">{text.length} / {toolLimits.fontPreview.previewChars} 字符；文字不保存、不上传。</p>
      <div className="font-preview-settings"><label>字号（px）<input type="number" min={8} max={160} step="any" value={size} onChange={(event) => setSize(event.target.value)} /></label><label>字重<input type="number" min={100} max={900} step={1} value={weight} onChange={(event) => setWeight(event.target.value)} /></label></div>
      {settings.error && <p className="utility-error" role="alert">{settings.error}</p>}
      <div className="utility-actions"><button type="button" onClick={clear}>清空字体</button><button type="button" onClick={() => { setSize("32"); setWeight("400"); }}>重置字号与字重</button></div>
      <p className="utility-muted">缺失字形会由系统字体回退补充，看到文字不等于文件包含该字。字重仅在字体提供相应可变轴时有效；不合成假粗体，不保证静态字体发生变化。</p>
      <p className="utility-muted">只用独立的页内名称，不安装字体、不请求系统字体权限，不导出字体。仅加载你有权使用的文件；离开页面、清空或重新选择时移除临时字体。</p>
      <p className="utility-muted">不支持 TTC / OTC 字体集合、字体编辑或完整字形覆盖检查。文件名不是字体内部家族名；格式与加载能力由当前浏览器验证。</p>
    </section><section className="utility-panel utility-controls"><h2>字体预览</h2>
      {task.result?.length && settings.value ? task.result.map((font) => <section className="font-preview-item" key={font.id}>
        <h3>{font.name}</h3><p className="utility-muted">{font.format} · 文件 {fileSize(font.size)} · 声明解压 {fileSize(font.decodedBytes)}</p>
        <div className="font-preview-sample" style={{ fontFamily: `"${font.family}", system-ui, sans-serif`, fontSize: `${settings.value!.pixels}px`, fontWeight: settings.value!.weight, fontVariationSettings: `"wght" ${settings.value!.weight}`, fontSynthesis: "none" }}>{text || "（未输入预览文字）"}</div>
      </section>) : <p className="utility-muted">选择字体后自动加载。文件只交给当前浏览器字体引擎；不会建立远程字体地址或生成下载链接。</p>}
    </section></div>
  </UtilityShell>;
}
