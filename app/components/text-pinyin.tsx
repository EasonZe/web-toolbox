"use client";
import { useState } from "react";
import { defaultPinyinOptions, type PinyinOptions } from "../lib/extra-tool-options";
import { runFileWorker } from "../lib/file-worker-client";
import { toolLimits } from "../lib/resource-limits";
import { TaskFeedback, useLocalTask } from "./local-workbench";
import { TextUtilityInput, TextUtilityResult } from "./text-utility-parts";
import { UtilityShell } from "./utility-shell";
export default function TextPinyin() {
  const [text, setText] = useState("生活明朗，万物可爱。\n重庆的音乐很好听。"), [options, setOptions] = useState(defaultPinyinOptions);
  const task = useLocalTask<string>();
  function change(next: Partial<PinyinOptions>) { task.reset(); setOptions({ ...options, ...next }); }
  return <UtilityShell className="additional-utilities" title="汉字转拼音" description="支持声调、数字声调、无声调、首字母和姓氏模式，保留原文换行。">
    <div className="utility-columns"><section className="utility-panel utility-controls">
      <label>输出形式<select value={options.tone} onChange={(e) => change({ tone: e.target.value as PinyinOptions["tone"] })}><option value="symbol">声调符号 · hàn yǔ</option><option value="num">数字声调 · han4 yu3</option><option value="none">无声调 · han yu</option><option value="initial">首字母 · h y</option></select></label>
      <label>拼音分隔<select value={options.separator} onChange={(e) => change({ separator: e.target.value as PinyinOptions["separator"] })}><option value=" ">空格</option><option value="-">短横线</option><option value="">无分隔</option></select></label>
      <fieldset className="compact-options"><legend>附加选项</legend><label className="utility-checkbox"><input type="checkbox" checked={options.uppercase} onChange={(e) => change({ uppercase: e.target.checked })} />大写输出</label><label className="utility-checkbox"><input type="checkbox" checked={options.surname} onChange={(e) => change({ surname: e.target.checked })} />姓氏优先（每行开头）</label></fieldset>
      <TextUtilityInput text={text} limit={toolLimits.text.pinyinChars} onChange={(value) => { task.reset(); setText(value); }} />
      <button type="button" className="primary-button" disabled={task.busy} onClick={() => void task.run((signal) => runFileWorker<string>({ action: "text-pinyin", text, options }, signal))}>转换拼音</button><TaskFeedback task={task} />
    </section><section className="utility-panel"><h2>结果</h2>{task.result !== null ? <TextUtilityResult key={task.result} text={task.result} name="pinyin.txt" /> : <p className="utility-muted">点击转换后查看、复制或下载拼音。</p>}<p className="utility-muted">使用 pinyin-pro 本地词库。多音字、人名和生僻字请人工核对；姓氏模式不用于整段文章。</p></section></div>
  </UtilityShell>;
}
