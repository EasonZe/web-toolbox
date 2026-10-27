"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { discardHandoff, handoffServerSnapshot, handoffSnapshot, handoffTargets, offerHandoff, peekHandoff, subscribeHandoff, type HandoffTarget } from "../lib/tool-handoff";
import { checkImagePixels, largeFilesWarning, toolLimits } from "../lib/resource-limits";
import { LocalDownload } from "./local-workbench";

export function ResultContinue({ targets, source, getFiles, count = 1, disabled = false }: { targets: readonly HandoffTarget[]; source: string; getFiles: () => File[]; count?: number; disabled?: boolean }) {
  const router = useRouter(), [error, setError] = useState("");
  function send(target: HandoffTarget) {
    if (disabled) return;
    let id: number | undefined;
    try {
      setError(""); const packet = offerHandoff(target, getFiles(), source); id = packet.id;
      router.push(target);
    } catch (cause) { if (id !== undefined) discardHandoff(id); setError(cause instanceof Error ? cause.message : "无法继续处理，请下载文件后手动导入。"); }
  }
  return <div className="tool-result-next"><p className="utility-muted">继续处理{count > 1 ? ` · ${count} 个已完成结果` : ""}</p><div className="utility-actions">{targets.map((target) => <button type="button" key={target} disabled={disabled} onClick={() => send(target)}>{handoffTargets[target].label}</button>)}</div>{error && <p className="utility-error" role="alert">{error}</p>}</div>;
}

export function ToolHandoffInput({ target, onFiles, disabled = false, behavior }: { target: HandoffTarget; onFiles: (files: File[]) => boolean | Promise<boolean>; disabled?: boolean; behavior: "append" | "replace" }) {
  const packet = useSyncExternalStore(subscribeHandoff, handoffSnapshot, handoffServerSnapshot), current = packet?.target === target ? packet : null;
  const [busy, setBusy] = useState(false), [error, setError] = useState<{ id: number; text: string } | null>(null), [expanded, setExpanded] = useState(false);
  const active = useRef(false), mounted = useRef(true);
  const context = useRef({ onFiles, disabled });
  useEffect(() => { context.current = { onFiles, disabled }; }, [onFiles, disabled]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function receive() {
    if (!current || disabled || active.current) return;
    const incoming = peekHandoff(target, current.id);
    if (!incoming) return;
    active.current = true; setBusy(true); setError(null);
    function valid() {
      if (!mounted.current || !peekHandoff(target, incoming!.id)) return false;
      if (context.current.onFiles !== onFiles || context.current.disabled) { setError({ id: incoming!.id, text: "输入状态已变化，请确认后再次接收文件。" }); return false; }
      return true;
    }
    try {
      // Preserve FileDropZone's header/pixel preflight as well as the target's own validation.
      for (const file of incoming.files) {
        if (/^image\/(png|jpeg|webp|bmp)$/i.test(file.type)) {
          const { inspectRasterHeader } = await import("../lib/local-images");
          if (!valid()) return;
          const dimensions = inspectRasterHeader(new Uint8Array(await file.slice(0, 65536).arrayBuffer()), toolLimits.image.pixels);
          if (!valid()) return;
          if (dimensions.width && dimensions.height) checkImagePixels(dimensions.width, dimensions.height);
        }
      }
      if (!valid()) return;
      const accepted = await onFiles([...incoming.files]);
      if (accepted) discardHandoff(incoming.id);
      else if (mounted.current) setError({ id: incoming.id, text: "未能导入，请查看工具提示。传入文件暂时保留，可重试或先下载。" });
    } catch (cause) { if (mounted.current) setError({ id: incoming.id, text: cause instanceof Error ? cause.message : "文件导入失败，请重试。" }); }
    finally { active.current = false; if (mounted.current) setBusy(false); }
  }
  if (!current) return null;
  const warning = largeFilesWarning(current.files);
  return <section className="utility-panel utility-controls tool-handoff-input" aria-label="接收其他工具的结果" aria-busy={busy}>
    <strong>来自{current.source} · {current.files.length} 个文件</strong><p className="utility-muted">{current.files[0].name}{current.files.length > 1 ? " 等" : ""}</p>
    <p className="utility-muted">确认后{behavior === "append" ? "添加到当前文件列表" : "替换当前输入并清除旧输出"}，不会自动开始处理。未接收文件仅在本标签页暂存 5 分钟，刷新后不保留。</p>
    {warning && <p className="utility-muted">{warning}</p>}<div className="utility-actions"><button type="button" disabled={disabled || busy} onClick={() => void receive()}>{busy ? "正在接收…" : warning ? "继续接收文件" : "接收文件"}</button><button type="button" disabled={busy} onClick={() => discardHandoff(current.id)}>忽略</button><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起文件" : "查看 / 下载文件"}</button></div>
    {expanded && <ul className="tool-handoff-files">{current.files.map((file, index) => <li key={index}><LocalDownload blob={file} name={file.name} title={file.name} /></li>)}</ul>}
    {error?.id === current.id && <p className="utility-error" role="alert">{error.text}</p>}
  </section>;
}
