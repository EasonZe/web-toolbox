"use client";
import { useEffect, useMemo, useState } from "react";
import { inspectJwt, jwtTimes } from "../lib/jwt-inspection";
import { toolLimits } from "../lib/resource-limits";
import { UtilityShell } from "./utility-shell";

export default function JwtInspector() {
  const [input, setInput] = useState(""), [message, setMessage] = useState(""), [now, setNow] = useState(0);
  useEffect(() => { const update = () => setNow(Date.now()); update(); const timer = setInterval(update, 1000); return () => clearInterval(timer); }, []);
  const decoded = useMemo(() => { if (!input.trim()) return { result: null, error: "" }; try { return { result: inspectJwt(input), error: "" }; } catch (cause) { return { result: null, error: (cause as Error).message }; } }, [input]);
  const result = decoded.result;
  return <UtilityShell className="additional-utilities" title="JWT 解析" description="本地查看 JWT 头部、载荷及时间声明，支持 Bearer 前缀。">
    <section className="utility-panel utility-controls"><label>JWT 内容<textarea rows={5} value={input} maxLength={toolLimits.jwt.chars} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="粘贴 header.payload.signature" onChange={(e) => { setInput(e.target.value); setMessage(""); }} /></label>
      <p className="utility-muted">仅解码，不验证签名或令牌可信度。内容不上传、不保存；“未过期”不代表令牌有效。</p>
      <div className="utility-actions"><button type="button" disabled={!input} onClick={() => { setInput(""); setMessage(""); }}>清空</button><button type="button" disabled={!result} onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(result?.payload, null, 2)); setMessage("载荷 JSON 已复制。"); } catch { setMessage("无法复制，请手动选择载荷文本。"); } }}>复制载荷 JSON</button></div>
      {decoded.error && <p role="alert" className="utility-error">{decoded.error}</p>}<p role="status" className="utility-muted">{message}</p>
    </section>
    {result && <><div className="utility-columns"><section className="utility-panel"><h2>头部 Header</h2><pre className="utility-code-output">{JSON.stringify(result.header, null, 2)}</pre></section><section className="utility-panel"><h2>载荷 Payload</h2><pre className="utility-code-output">{JSON.stringify(result.payload, null, 2)}</pre></section></div>
      <section className="utility-panel"><h2>时间声明与签名</h2>{jwtTimes(result.payload, now).map((item) => <p className="utility-code-output" key={item.key}><strong>{item.key}</strong> · {item.status}{item.iso && ` · ${item.iso}（UTC）`}</p>)}<p className="utility-muted">{result.signature ? "包含签名，尚未验证。" : "没有签名。"}{!jwtTimes(result.payload, now).length ? " 载荷没有 iat、nbf 或 exp 时间声明。" : ""}</p></section></>}
  </UtilityShell>;
}
