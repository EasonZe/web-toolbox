"use client";
import { useState } from "react";
import { inspectCidr } from "../lib/cidr-calculator";
import { UtilityShell } from "./utility-shell";
import { TextUtilityResult } from "./text-utility-parts";
export default function CidrCalculator() {
  const [input, setInput] = useState("192.168.1.42/24"), [query, setQuery] = useState(""), [result, setResult] = useState<ReturnType<typeof inspectCidr> | null>(null), [error, setError] = useState("");
  function reset() { setResult(null); setError(""); }
  return <UtilityShell className="additional-utilities" title="IP / CIDR 子网计算" description="计算 IPv4 / IPv6 网络范围、掩码、地址数量，并检查地址是否位于子网内；不发起网络请求。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>网络设置</h2>
      <label>IP 地址 / CIDR<input value={input} maxLength={205} autoCapitalize="none" spellCheck={false} onChange={(e) => { reset(); setInput(e.target.value); }} /></label>
      <div className="utility-actions">{["192.168.1.42/24", "10.0.0.1/8", "2001:db8::1/64", "::/0"].map((sample) => <button type="button" key={sample} onClick={() => { reset(); setInput(sample); setQuery(""); }}>{sample}</button>)}</div>
      <label>检查某个 IP（可选）<input value={query} maxLength={200} placeholder="例如 192.168.1.100" autoCapitalize="none" spellCheck={false} onChange={(e) => { reset(); setQuery(e.target.value); }} /></label>
      <button type="button" className="primary-button" onClick={() => { try { setResult(inspectCidr(input, query)); setError(""); } catch (cause) { setResult(null); setError((cause as Error).message); } }}>计算子网</button>
      {error && <p className="utility-error" role="alert">{error}</p>}
      <p className="utility-muted">省略前缀时按单个地址 /32 或 /128。IPv4 只接受四段十进制；不接受端口、域名或 IPv6 区域标识。IPv4 映射 IPv6 保持为 IPv6，不自动混用地址族。</p>
      <p className="utility-muted">IPv4 /0–/30 的常规可用数量扣除网络和广播；/31 按点到点约定计 2 个，/32 计 1 个。该数量未扣除特殊用途地址和实际分配限制。IPv6 无广播，不将全部地址数量宣称为可分配主机数。计算不能证明地址可达或网络配置正确。</p>
    </section><section className="utility-panel"><h2>计算结果</h2>{result ? <><dl className="network-detail-list">{result.rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><TextUtilityResult text={result.text} name="subnet.txt" /></> : <p className="utility-muted">填写地址后计算；IPv6 数量使用整数精确表示，不转换为浮点数。</p>}</section></div>
  </UtilityShell>;
}
