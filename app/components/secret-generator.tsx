"use client";
import { useState } from "react";
import { generateSecrets, type PasswordGroup } from "../lib/secure-generator";
import { toolLimits } from "../lib/resource-limits";
import { downloadLocal } from "../lib/local-files";
import { UtilityShell } from "./utility-shell";

const groupLabels: [PasswordGroup, string][] = [["lower", "小写字母"], ["upper", "大写字母"], ["digits", "数字"], ["symbols", "符号"]];
export default function SecretGenerator() {
  const [mode, setMode] = useState<"password" | "uuid">("password"), [length, setLength] = useState(20), [count, setCount] = useState(1);
  const [groups, setGroups] = useState<PasswordGroup[]>(["lower", "upper", "digits", "symbols"]), [excludeSimilar, setExcludeSimilar] = useState(true);
  const [result, setResult] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  function clearResult() { setResult(""); setMessage(""); setError(""); }
  function generate() {
    clearResult();
    try { setResult(generateSecrets({ mode, count, length, groups, excludeSimilar }).join("\n")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "生成失败，请重试。"); }
  }
  return <UtilityShell className="additional-utilities" title="密码与 UUID 生成" description="本地生成随机密码与 UUID v4，支持批量复制和 TXT 导出。">
    <div className="utility-columns">
      <section className="utility-panel utility-controls"><h2>生成设置</h2>
        <label>生成类型<select value={mode} onChange={(e) => { clearResult(); setMode(e.target.value as typeof mode); }}><option value="password">随机密码</option><option value="uuid">UUID v4</option></select></label>
        <label>生成数量<input type="number" min="1" max={toolLimits.generators.batch} value={count} onChange={(e) => { clearResult(); setCount(Number(e.target.value)); }} /></label>
        {mode === "password" && <>
          <label>密码长度<input type="number" min="8" max={toolLimits.generators.passwordLength} value={length} onChange={(e) => { clearResult(); setLength(Number(e.target.value)); }} /></label>
          <fieldset className="compact-options"><legend>包含的字符类型</legend>{groupLabels.map(([key, label]) => <label className="utility-checkbox" key={key}><input type="checkbox" checked={groups.includes(key)} onChange={(e) => { clearResult(); setGroups(e.target.checked ? [...groups, key] : groups.filter((item) => item !== key)); }} />{label}</label>)}</fieldset>
          <label className="utility-checkbox"><input type="checkbox" checked={excludeSimilar} onChange={(e) => { clearResult(); setExcludeSimilar(e.target.checked); }} />排除易混字符 i、l、L、o、O、0、1</label>
        </>}
        <button className="primary-button" type="button" onClick={generate}>生成{mode === "password" ? "密码" : " UUID"}</button>
        <p className="utility-muted">使用浏览器安全随机数。生成内容不会上传或保存到浏览器；离开页面前请自行妥善保存。</p>
        {error && <p className="utility-error" role="alert">{error}</p>}
      </section>
      <section className="utility-panel utility-controls"><h2>生成结果</h2><label>每行一条<textarea aria-label="生成结果" rows={12} readOnly value={result} placeholder="点击生成后显示结果" spellCheck={false} /></label>
        <div className="utility-actions"><button type="button" disabled={!result} onClick={async () => { try { await navigator.clipboard.writeText(result); setMessage("已复制全部结果。"); } catch { setMessage("无法访问剪贴板，请手动复制。"); } }}>复制全部</button><button type="button" disabled={!result} onClick={() => downloadLocal(new Blob([result], { type: "text/plain;charset=utf-8" }), `${mode}.txt`)}>下载 TXT</button><button type="button" disabled={!result} onClick={clearResult}>清空</button></div>
        <p className="utility-muted" role="status">{message}</p>
      </section>
    </div>
  </UtilityShell>;
}
