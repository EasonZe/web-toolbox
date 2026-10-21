"use client";
/* eslint-disable @next/next/no-img-element -- Local package Blob previews never upload assets. */
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { UtilityShell } from "./utility-shell";
import { LocalDownload, LocalUpload, TaskFeedback, useBlobUrl, useLocalTask } from "./local-workbench";
import { runAssetWorker } from "../lib/game-asset-client";
import { fileSize, safeName } from "../lib/local-files";
import { toolLimits } from "../lib/resource-limits";
import { loadRaster } from "../lib/local-images";
import { UnityAssetTree } from "./unity-asset-tree";
import type { UnityAsset, UnityPackage } from "../lib/game-asset-types";
const ModelPreview = dynamic(() => import("./unity-model-preview"), { ssr: false, loading: () => <p className="utility-muted">正在加载模型预览…</p> });
function CheckedUnityImage({ blob, name }: { blob: Blob; name: string }) {
  const { run, reset, result, error } = useLocalTask<boolean>();
  const url = useBlobUrl(result ? blob : null);
  useEffect(() => {
    void run(async (signal) => { const image = await loadRaster(new File([blob], name), signal); image.close(); return true; });
    return reset;
  }, [blob, name, run, reset]);
  return error ? <p className="utility-muted">图片预览不可用：{error} 可下载原资源查看。</p> : url ? <img className="workbench-image asset-checker" src={url} alt={name} /> : <p className="utility-muted">正在检查图片…</p>;
}
function AssetPreview({ asset }: { asset: UnityAsset }) {
  const url = useBlobUrl(asset.kind === "音频" ? asset.asset : null);
  const [text, setText] = useState<{ value: string; truncated: boolean } | null>(null);
  const [showModel, setShowModel] = useState(false);
  const canModel = asset.kind === "模型" && /\.(fbx|glb|obj|stl)$/i.test(asset.path);
  useEffect(() => {
    if (asset.kind !== "文本" || !asset.asset) return;
    let disposed = false;
    void asset.asset.slice(0, toolLimits.unity.textPreviewBytes).arrayBuffer().then((buffer) => {
      let value: string;
      try { value = new TextDecoder("utf-8", { fatal: true }).decode(buffer); if (value.includes("\0")) throw new Error(); }
      catch { value = "这是二进制资源或非 UTF-8 文本，可下载后在 Unity 中查看。"; }
      if (!disposed) setText({ value, truncated: asset.asset!.size > toolLimits.unity.textPreviewBytes });
    }).catch(() => { if (!disposed) setText({ value: "读取失败，请下载原文件查看。", truncated: false }); });
    return () => { disposed = true; };
  }, [asset]);
  return <section className="utility-panel unity-preview" aria-label="资源预览">
    <h2>资源预览</h2>
    <p className="asset-path">{asset.path}</p>
    <dl className="workbench-details"><div><dt>类型</dt><dd>{asset.kind}</dd></div><div><dt>大小</dt><dd>{fileSize(asset.size)}</dd></div><div><dt>GUID</dt><dd><code>{asset.guid}</code></dd></div></dl>
    {showModel && asset.asset && canModel ? <ModelPreview blob={asset.asset} name={asset.path} /> : asset.kind === "图片" && asset.asset ? <CheckedUnityImage blob={asset.asset} name={asset.path.split("/").at(-1)!} /> : asset.kind === "音频" && url ? <audio controls preload="metadata" src={url} onError={(e) => { e.currentTarget.nextElementSibling?.removeAttribute("hidden"); }} /> : asset.kind === "文本" ? <pre className="asset-text-preview">{text?.value ?? "正在读取文字…"}</pre> : asset.thumbnail ? <><CheckedUnityImage blob={asset.thumbnail} name="preview.png" /><p className="utility-muted">资源包内缩略图</p></> : <div className="utility-empty compact">{asset.kind === "文件夹" ? "这是资源目录。" : "此资源没有包内缩略图，可下载原文件查看。"}</div>}
    {asset.kind === "音频" && <p hidden className="utility-muted">当前浏览器无法解码这段音频，请下载后播放。</p>}
    {canModel && <button type="button" onClick={() => setShowModel((value) => !value)}>{showModel ? "关闭模型预览" : "加载模型预览"}</button>}
    {asset.kind === "模型" && <p className="utility-muted">几何预览支持 FBX、GLB、OBJ、STL；Unity 材质、预制体、脚本与场景效果请在编辑器中查看。</p>}
    {text?.truncated && <p className="utility-muted">仅预览前 1 MB，下载保留完整内容。</p>}
    <div className="asset-downloads">
      {asset.asset && <LocalDownload blob={asset.asset} name={safeName(asset.path.split("/").at(-1)!)} title="下载原资源" />}
      {asset.meta && <LocalDownload blob={asset.meta} name={safeName(`${asset.path.split("/").at(-1)}.meta`)} title="下载 .meta" />}
    </div>
  </section>;
}
export default function UnityPackagePreview() {
  const parsing = useLocalTask<UnityPackage>(), exporting = useLocalTask<Blob>();
  const [fileName, setFileName] = useState(""), [query, setQuery] = useState(""), [kind, setKind] = useState("全部");
  const [selected, setSelected] = useState<Set<string>>(new Set()), [activeId, setActiveId] = useState(""), [includeMeta, setIncludeMeta] = useState(true);
  const assets = useMemo(() => parsing.result?.assets ?? [], [parsing.result]);
  const filtered = useMemo(() => assets.filter((asset) => (kind === "全部" || asset.kind === kind) && `${asset.path} ${asset.guid}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [assets, kind, query]);
  const filteredIds = useMemo(() => new Set(filtered.map((asset) => asset.guid)), [filtered]);
  const active = assets.find((asset) => asset.guid === activeId), busy = parsing.busy || exporting.busy;
  const allFilteredSelected = !!filtered.length && filtered.every((asset) => selected.has(asset.guid));
  function selectTree(guids: string[], checked: boolean) { exporting.reset(); setSelected((old) => { const next = new Set(old); for (const guid of guids) { if (checked) next.add(guid); else next.delete(guid); } return next; }); }
  return <UtilityShell title="Unity 资源包预览" description="本地查看 .unitypackage 的目录、图片、音频、文本与模型，按需提取资源和 .meta。">
    <LocalUpload accept=".unitypackage" title="选择 Unity 资源包 / 拖入文件" hint=".unitypackage · 最大 512 MB · 解压后最多 1 GB / 20000 项资源 · 文件仅在本机处理" disabled={busy} onFiles={async (files) => {
      setFileName(""); setSelected(new Set()); setActiveId(""); setQuery(""); setKind("全部"); exporting.reset();
      const result = await parsing.run((signal, report) => runAssetWorker<UnityPackage>({ action: "unity-read", file: files[0] }, signal, report));
      if (result) { setFileName(files[0].name); setActiveId(result.assets.find((a) => a.kind === "图片")?.guid ?? result.assets[0].guid); }
    }} />
    <p className="utility-muted">支持 Unity 编辑器导出的资源包；运行时 .bundle / .assets、加密包与场景运行效果不在此格式范围内。</p>
    <TaskFeedback task={parsing} />
    <UnityAssetTree key={fileName || "empty"} assets={assets} filteredIds={filteredIds} filterKey={query.trim() || kind !== "全部" ? JSON.stringify([query.trim().toLocaleLowerCase(), kind]) : ""} activeId={activeId} selected={selected} busy={busy} onActivate={setActiveId} onSelect={selectTree}>
      {({ tree, controls }) => <div className="workbench-two unity-workspace">
        <section className="utility-panel unity-directory" aria-label="资源目录">
          <h2>资源目录</h2>
          {tree}
        </section>
        <div className="asset-preview-stack unity-sidebar">
          {active ? <AssetPreview key={active.guid} asset={active} /> : <section className="utility-panel unity-preview" aria-label="资源预览"><h2>资源预览</h2><div className="utility-empty compact">选择资源查看图片、音频、文本、模型或包内缩略图。</div></section>}
          <section className="utility-panel utility-controls unity-operations" aria-label="资源操作">
            <h2>资源操作</h2>
            <div className="workbench-fields"><label>搜索路径或 GUID<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例如 Assets/Textures" /></label><label>资源类型<select value={kind} onChange={(e) => setKind(e.target.value)}>{["全部", "图片", "音频", "文本", "模型", "文件夹", "其他"].map((value) => <option key={value}>{value}</option>)}</select></label></div>
            <p className="utility-muted">{fileName || "尚未选择资源包"} · {assets.length} 项 · 筛选后 {filtered.length} 项 · 已选 {selected.size} 项</p>
            <div className="utility-actions"><button type="button" disabled={!filtered.length || busy} onClick={() => { exporting.reset(); setSelected((old) => { const next = new Set(old); for (const asset of filtered) { if (allFilteredSelected) next.delete(asset.guid); else next.add(asset.guid); } return next; }); }}>{allFilteredSelected ? "取消选择筛选结果" : "选择全部筛选结果"}</button><button type="button" disabled={!selected.size || busy} onClick={() => { setSelected(new Set()); exporting.reset(); }}>清空选择</button></div>
            {controls}
          </section>
        </div>
      </div>}
    </UnityAssetTree>
    <label className="utility-checkbox asset-checkbox"><input type="checkbox" checked={includeMeta} disabled={busy} onChange={(e) => { setIncludeMeta(e.target.checked); exporting.reset(); }} />导出时包含 .meta（保留 Unity GUID）</label>
    <button type="button" className="primary-button" disabled={!selected.size || busy} onClick={() => void exporting.run((signal, report) => runAssetWorker<Blob>({ action: "unity-export", assets: assets.filter((asset) => selected.has(asset.guid)), includeMeta }, signal, report))}>提取已选资源为 ZIP</button>
    <TaskFeedback task={exporting} />
    {exporting.result && <LocalDownload blob={exporting.result} name={`${safeName(fileName.replace(/\.unitypackage$/i, ""))}-assets.zip`} title="下载已选资源 ZIP" />}
  </UtilityShell>;
}
