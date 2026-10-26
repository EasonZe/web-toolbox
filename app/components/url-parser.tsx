"use client";
import { useMemo, useState } from "react";
import { inspectUrl, editUrl, removeTrackingParameters, type UrlParameter } from "../lib/url-parser";
import { toolLimits } from "../lib/resource-limits";
import { UtilityShell } from "./utility-shell";
import { TextUtilityResult } from "./text-utility-parts";
export default function UrlParser() {
  const [input, setInput] = useState("https://example.com/search?q=多功能工具箱&tag=video&tag=image#tools"), [base, setBase] = useState(""), [result, setResult] = useState<ReturnType<typeof inspectUrl> | null>(null), [error, setError] = useState("");
  const [parameters, setParameters] = useState<UrlParameter[]>([]), [fragment, setFragment] = useState(""), [edited, setEdited] = useState(false), [removeCredentials, setRemoveCredentials] = useState(false), [page, setPage] = useState(0);
  const output = useMemo(() => { if (!result) return { value: "", error: "" }; try { return { value: edited ? editUrl(result.href, parameters, fragment, removeCredentials) : result.href, error: "" }; } catch (cause) { return { value: "", error: (cause as Error).message }; } }, [result, parameters, fragment, removeCredentials, edited]);
  function reset() { setResult(null); setError(""); setParameters([]); setPage(0); }
  const pages = Math.max(1, Math.ceil(parameters.length / toolLimits.pageRows)), currentPage = Math.min(page, pages - 1), start = currentPage * toolLimits.pageRows;
  function update(index: number, next: Partial<UrlParameter>) { setEdited(true); setParameters(parameters.map((item, i) => i === index ? { ...item, ...next } : item)); }
  return <UtilityShell className="additional-utilities" title="URL 解析与参数编辑" description="拆解网址组成、查看与编辑查询参数，保留重复键和顺序；只分析文本，不打开或请求网址。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>网址输入</h2>
      <label>URL<textarea rows={5} value={input} maxLength={toolLimits.url.chars} spellCheck={false} onChange={(e) => { reset(); setInput(e.target.value); }} /></label>
      <label>基准 URL（仅相对路径需要）<input value={base} maxLength={toolLimits.url.chars} placeholder="https://example.com/folder/" spellCheck={false} onChange={(e) => { reset(); setBase(e.target.value); }} /></label>
      <button type="button" className="primary-button" onClick={() => { try { const next = inspectUrl(input, base); setResult(next); setParameters(next.parameters); setFragment(next.fragment); setEdited(false); setRemoveCredentials(false); setPage(0); setError(""); } catch (cause) { reset(); setError((cause as Error).message); } }}>解析 URL</button>
      {error && <p className="utility-error" role="alert">{error}</p>}
      <p className="utility-muted">仅支持 HTTP / HTTPS。遵循 WHATWG URL 标准：域名可规范化为 ASCII，默认端口和路径会规范化。参数按表单规则解码，+ 表示空格，异常 UTF-8 可能显示替换字符；未经参数编辑的查询串不重新序列化。</p>
      <p className="utility-muted">编辑后参数按表单规则编码，空格可能变成 +，原有签名可能失效。输入不上传、不写入历史或草稿；含密码、令牌的 URL 请勿公开。</p>
      {result && <dl className="network-detail-list">{result.rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value || "（空）"}</dd></div>)}</dl>}
    </section><section className="utility-panel utility-controls"><h2>参数与结果</h2>{result ? <>
      <div className="utility-actions"><button type="button" disabled={parameters.length >= toolLimits.url.parameters} onClick={() => { setEdited(true); setParameters([...parameters, { key: "", value: "" }]); setPage(Math.floor(parameters.length / toolLimits.pageRows)); }}>添加参数</button><button type="button" onClick={() => { setEdited(true); setParameters(removeTrackingParameters(parameters)); setPage(0); }}>移除常见追踪参数</button></div>
      <p className="utility-muted">{parameters.length} 个参数 · 每页最多 {toolLimits.pageRows} 项 · 空键、空值与重复键均保留</p>
      <div className="url-parameter-list">{parameters.slice(start, start + toolLimits.pageRows).map((item, i) => <fieldset key={start + i}><legend>参数 {start + i + 1}</legend><label>名称<input aria-label={`参数 ${start + i + 1} 名称`} value={item.key} maxLength={toolLimits.url.chars} spellCheck={false} onChange={(e) => update(start + i, { key: e.target.value })} /></label><label>值<input aria-label={`参数 ${start + i + 1} 值`} value={item.value} maxLength={toolLimits.url.chars} spellCheck={false} onChange={(e) => update(start + i, { value: e.target.value })} /></label><button type="button" aria-label={`删除参数 ${start + i + 1}`} onClick={() => { setEdited(true); setParameters(parameters.filter((_, index) => index !== start + i)); }}>删除</button></fieldset>)}</div>
      {pages > 1 && <div className="utility-actions"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {pages}</span><button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
      <label>片段（原编码，不含 #）<input value={fragment} maxLength={toolLimits.url.chars} spellCheck={false} onChange={(e) => { setEdited(true); setFragment(e.target.value); }} /></label>
      {result.credentials && <label className="utility-checkbox"><input type="checkbox" checked={removeCredentials} onChange={(e) => { setEdited(true); setRemoveCredentials(e.target.checked); }} />从输出移除账户名和密码</label>}
      {output.error && <p className="utility-error" role="alert">{output.error}</p>}{output.value && <TextUtilityResult text={output.value} name="url.txt" />}
    </> : <p className="utility-muted">解析后查看网址结构并编辑参数；结果不会变为可自动访问的链接。</p>}</section></div>
  </UtilityShell>;
}
