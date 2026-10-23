"use client";
import { useMemo, useState } from "react";
import { readTextFile } from "../lib/local-files";
import { LocalDownload, LocalUpload, TaskFeedback, useLocalTask } from "./local-workbench";

export function TextUtilityInput({ text, onChange, limit, accept = ".txt,text/plain", label = "输入文本" }: { text: string; onChange: (value: string) => void; limit: number; accept?: string; label?: string }) {
  const upload = useLocalTask<null>();
  return <>
    <LocalUpload accept={accept} title="导入 UTF-8 文本文件" hint="本地处理，不上传、不保存输入内容" onFiles={async (files) => {
      await upload.run(async (signal) => {
        if (files.length !== 1) throw new Error("请选择一个文本文件。");
        const value = await readTextFile(files[0]); signal.throwIfAborted();
        if (value.length > limit) throw new Error(`文本超过 ${limit.toLocaleString()} 字符，请分批处理；未截断文件。`);
        onChange(value); return null;
      });
    }} /><TaskFeedback task={upload} />
    <label>{label}<textarea rows={10} value={text} maxLength={limit} spellCheck={false} onChange={(e) => { upload.reset(); onChange(e.target.value); }} /></label>
    <p className="utility-muted">{text.length.toLocaleString()} / {limit.toLocaleString()} 字符</p>
  </>;
}
export function TextUtilityResult({ text, name = "result.txt", mime = "text/plain" }: { text: string; name?: string; mime?: string }) {
  const [message, setMessage] = useState("");
  const blob = useMemo(() => new Blob([text], { type: `${mime};charset=utf-8` }), [text, mime]);
  return <div className="utility-controls"><label>转换结果<textarea readOnly rows={12} value={text.slice(0, 50000)} spellCheck={false} /></label>
    <p className="utility-muted">共 {text.length.toLocaleString()} 字符{text.length > 50000 && "；仅预览前 5 万字符，复制和下载包含完整结果"}。</p>
    <div className="utility-actions"><button type="button" onClick={async () => {
      try { if (!navigator.clipboard) throw new Error("无法访问剪贴板，请下载文件或手动复制。"); await navigator.clipboard.writeText(text); setMessage("已复制完整结果。"); }
      catch { setMessage("复制失败，请下载文件或手动复制。"); }
    }}>复制结果</button><LocalDownload blob={blob} name={name} title="下载结果" /></div><p className="utility-muted" role="status">{message}</p>
  </div>;
}
