"use client";
import { useMemo, useState } from "react";
import {
  inspectBrowserCapabilities,
  parseUserAgent,
  readCurrentUserAgent,
  userAgentCaveats,
  type BrowserCapabilities,
  type UserAgentInfo,
  type UserAgentSource,
} from "../lib/browser-info";
import { toolLimits } from "../lib/resource-limits";
import { UtilityShell } from "./utility-shell";
import { TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityInput, TextUtilityResult } from "./text-utility-parts";

const describe = (...values: string[]) => values.filter(Boolean).join(" · ") || "未识别";
const exposureLabels = { present: "存在（不代表可用）", absent: "未暴露", unreadable: "无法读取" } as const;
const booleanLabel = (value: boolean | null) => value === null ? "无法确认" : value ? "是" : "否";

export default function BrowserInfo() {
  const [text, setText] = useState("");
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const task = useLocalTask<UserAgentInfo>();
  const uaOutput = useMemo(() => task.result ? JSON.stringify(task.result, null, 2) : "", [task.result]);
  const capabilityOutput = useMemo(() => capabilities ? JSON.stringify(capabilities, null, 2) : "", [capabilities]);
  const parse = (value: string, source: UserAgentSource) => {
    void task.run((signal) => parseUserAgent(value, source, signal));
  };

  return <UtilityShell className="additional-utilities" title="浏览器信息与能力检测" description="解析 User-Agent，或主动查看当前浏览器暴露的 API；本地处理，不请求权限。">
    <div className="utility-columns"><section className="utility-panel utility-controls"><h2>User-Agent 解析</h2>
      <TextUtilityInput text={text} limit={toolLimits.url.chars} label="User-Agent（单行）" onChange={(value) => { task.reset(); setText(value); }} />
      <div className="utility-actions">
        <button type="button" className="primary-button" disabled={task.busy} onClick={() => parse(text, "pasted-user-agent")}>解析 User-Agent</button>
        <button type="button" onClick={() => {
          task.reset();
          try { const value = readCurrentUserAgent(); setText(value); parse(value, "current-user-agent"); }
          catch (cause) { task.setError(cause instanceof Error ? cause.message : "无法读取当前 User-Agent。"); }
        }}>读取当前浏览器</button>
        <button type="button" onClick={() => { task.reset(); setText(""); }}>清空 User-Agent</button>
      </div>
      <TaskFeedback task={task} />
      <p className="utility-muted">页面打开时不自动读取浏览器信息。粘贴其他浏览器的 User-Agent，不会检测或推测其实际 API 能力。</p>
      {userAgentCaveats.map((note) => <p className="utility-muted" key={note}>{note}</p>)}
    </section><section className="utility-panel"><h2>解析结果</h2>
      {task.result ? <>
        <p className="utility-muted">来源：{task.result.source === "current-user-agent" ? "主动读取的当前浏览器 User-Agent" : "手动粘贴 / 导入的 User-Agent"}</p>
        <dl className="network-detail-list">
          <div><dt>浏览器</dt><dd>{describe(task.result.browser.name, task.result.browser.version)}</dd></div>
          <div><dt>操作系统</dt><dd>{describe(task.result.system.name, task.result.system.version, task.result.system.versionName)}</dd></div>
          <div><dt>引擎</dt><dd>{describe(task.result.engine.name, task.result.engine.version)}</dd></div>
          <div><dt>设备类型</dt><dd>{describe(task.result.device.type)}</dd></div>
          <div><dt>厂商 / 型号</dt><dd>{describe(task.result.device.vendor, task.result.device.model)}</dd></div>
        </dl>
        <TextUtilityResult key={uaOutput} text={uaOutput} name="browser-user-agent.json" mime="application/json" />
      </> : <p className="utility-muted">输入后点击解析，结果可复制或导出 JSON。未识别的字段留空，不补猜测值。</p>}
    </section></div>
    <section className="utility-panel utility-controls"><h2>当前浏览器 API 暴露状态</h2>
      <p className="utility-muted">此区域仅检查当前浏览器，与上方粘贴内容无关。不启动摄像头、麦克风、音频、编解码器或文件选择器。</p>
      <div className="utility-actions"><button type="button" onClick={() => setCapabilities(inspectBrowserCapabilities())}>{capabilities ? "重新检查当前环境" : "检查当前环境 API"}</button>{capabilities && <button type="button" onClick={() => setCapabilities(null)}>清空 API 检测</button>}</div>
      {capabilities && <>
        <p className="utility-muted" role="status">仅确认 API 是否存在，不代表功能实际可用。</p>
        <dl className="network-detail-list">
          <div><dt>安全上下文</dt><dd>{booleanLabel(capabilities.secureContext)}</dd></div>
          <div><dt>跨源隔离</dt><dd>{booleanLabel(capabilities.crossOriginIsolated)}</dd></div>
          {capabilities.apis.map((api) => <div key={api.name}><dt>{api.name}</dt><dd>{exposureLabels[api.exposure]}</dd></div>)}
        </dl>
        {capabilities.caveats.map((note) => <p className="utility-muted" key={note}>{note}</p>)}
        <TextUtilityResult key={capabilityOutput} text={capabilityOutput} name="current-browser-capabilities.json" mime="application/json" />
      </>}
    </section>
  </UtilityShell>;
}
