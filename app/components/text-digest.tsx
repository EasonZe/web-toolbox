"use client";
import { useState } from "react";
import { compareTextDigest, digestAlgorithms, digestText, type DigestAlgorithm, type DigestOptions, type DigestResult } from "../lib/text-digest";
import { toolLimits } from "../lib/resource-limits";
import { UtilityShell } from "./utility-shell";
import { TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityInput, TextUtilityResult } from "./text-utility-parts";

export default function TextDigest() {
  const [text, setText] = useState("生活明朗，万物可爱。"), [algorithm, setAlgorithm] = useState<DigestAlgorithm>("SHA-256");
  const [mode, setMode] = useState<DigestOptions["mode"]>("hash"), [encoding, setEncoding] = useState<DigestOptions["encoding"]>("utf8");
  const [key, setKey] = useState(""), [keyEncoding, setKeyEncoding] = useState<DigestOptions["keyEncoding"]>("utf8"), [expected, setExpected] = useState("");
  const task = useLocalTask<DigestResult>();
  const comparison = task.result ? compareTextDigest(expected, task.result.hex) : "";
  return <UtilityShell className="additional-utilities" title="文本哈希与 HMAC" description="计算文本或 Hex 字节的 SHA 摘要、HMAC，输出 Hex 和 Base64 并核对摘要。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>内容与算法</h2>
      <div className="digest-options"><label>模式<select value={mode} onChange={(e) => { task.reset(); setMode(e.target.value as DigestOptions["mode"]); }}><option value="hash">哈希摘要</option><option value="hmac">HMAC 密钥摘要</option></select></label>
        <label>算法<select value={algorithm} onChange={(e) => { task.reset(); setAlgorithm(e.target.value as DigestAlgorithm); }}>{digestAlgorithms.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>内容编码<select value={encoding} onChange={(e) => { task.reset(); setEncoding(e.target.value as DigestOptions["encoding"]); }}><option value="utf8">UTF-8 文本</option><option value="hex">Hex 字节（不含 0x）</option></select></label></div>
      <TextUtilityInput text={text} limit={toolLimits.text.codecChars} onChange={(value) => { task.reset(); setText(value); }} label={encoding === "utf8" ? "输入文本（保留空格和换行）" : "输入 Hex（允许空格和换行）"} />
      {mode === "hmac" && <><label>密钥编码<select value={keyEncoding} onChange={(e) => { task.reset(); setKeyEncoding(e.target.value as DigestOptions["keyEncoding"]); }}><option value="utf8">UTF-8 文本</option><option value="hex">Hex 字节</option></select></label><label>HMAC 密钥<input type="password" autoComplete="off" spellCheck={false} value={key} maxLength={toolLimits.textDigest.keyBytes * 3} onChange={(e) => { task.reset(); setKey(e.target.value); }} /></label></>}
      <div className="utility-actions"><button className="primary-button" type="button" disabled={task.busy} onClick={() => void task.run((signal) => digestText(text, { algorithm, mode, encoding, key, keyEncoding }, signal))}>计算摘要</button><button type="button" onClick={() => { task.reset(); setText(""); setKey(""); setExpected(""); }}>清空内容与密钥</button></div><TaskFeedback task={task} />
      <p className="utility-muted">空内容可以计算，HMAC 密钥不能为空。UTF-8 不做 Unicode 规范化，换行和空格参与计算。Hex 每字节两位，忽略空白，不接受 0x 前缀。</p>
      <p className="utility-muted">使用浏览器 Web Crypto，需 HTTPS 或 localhost。不上传、不保存内容和密钥。摘要不是加密或密码存储方案；核对结果仅供本地调试，不替代协议签名验证或来源认证。</p>
    </section><section className="utility-panel utility-controls"><h2>摘要结果</h2>{task.result ? <><p className="utility-muted">{mode === "hmac" ? "HMAC-" : ""}{algorithm} · 输入 {task.result.bytes.toLocaleString()} 字节</p><TextUtilityResult key={task.result.hex} text={`Hex:\n${task.result.hex}\n\nBase64:\n${task.result.base64}\n`} name="text-digest.txt" /><label>待核对的 Hex 摘要（可选）<input value={expected} maxLength={128} spellCheck={false} onChange={(e) => setExpected(e.target.value)} /></label>{comparison && <p className="utility-muted" role="status">{comparison}</p>}</> : <p className="utility-muted">计算后显示完整 Hex、Base64 与字节数。修改内容、模式、算法或密钥会清除旧结果。</p>}</section></div>
  </UtilityShell>;
}
