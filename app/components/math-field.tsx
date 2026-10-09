"use client";

import { useEffect, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";

let mathLive: Promise<typeof import("mathlive")> | undefined;
function loadMathLive() {
  mathLive ??= import("mathlive").then((module) => {
    module.MathfieldElement.fontsDirectory = "/mathlive/0.111.0/fonts";
    module.MathfieldElement.soundsDirectory = null;
    module.MathfieldElement.computeEngine = null;
    module.MathfieldElement.locale = "zh-cn";
    return module;
  }).catch((error) => { mathLive = undefined; throw error; });
  return mathLive;
}

export function MathField({ value, label, readOnly = false, onChange, onEnter }: {
  value: string; label: string; readOnly?: boolean; onChange?: (value: string) => void; onEnter?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const element = useRef<MathfieldElement | null>(null);
  const latest = useRef({ value, label, onChange, onEnter });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    latest.current = { value, label, onChange, onEnter };
    if (element.current) {
      element.current.setAttribute("aria-label", label);
      if (element.current.value !== value) element.current.setValue(value, { silenceNotifications: true });
    }
  }, [value, label, onChange, onEnter]);

  useEffect(() => {
    let disposed = false;
    let field: MathfieldElement | undefined;
    const input = () => {
      if (!field) return;
      if (field.value.length > 500) field.setValue(latest.current.value, { silenceNotifications: true });
      else if (field.value !== latest.current.value) latest.current.onChange?.(field.value);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !readOnly) { event.preventDefault(); latest.current.onEnter?.(); }
    };
    void loadMathLive().then(({ MathfieldElement }) => {
      if (disposed || !container.current) return;
      field = new MathfieldElement();
      field.setAttribute("aria-label", latest.current.label);
      field.readOnly = readOnly;
      field.mathVirtualKeyboardPolicy = readOnly ? "manual" : "auto";
      field.smartFence = true;
      field.value = latest.current.value;
      if (readOnly) field.tabIndex = -1;
      field.addEventListener("input", input);
      field.addEventListener("keydown", keydown);
      container.current.appendChild(field);
      element.current = field;
      setReady(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      field?.removeEventListener("input", input);
      field?.removeEventListener("keydown", keydown);
      field?.remove();
      element.current = null;
    };
  }, [readOnly]);

  return <div className={`science-math-field${readOnly ? " is-output" : ""}`}>
    <div ref={container} />
    {!ready && (readOnly ? <span className="science-formula-fallback">{value}</span> : <input aria-label={label} value={value} maxLength={500} spellCheck={false} onChange={(event) => onChange?.(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onEnter?.(); } }} />)}
    {!readOnly && failed && <p className="utility-muted">公式编辑器暂未加载，可直接输入 LaTeX 公式，或刷新后重试。</p>}
  </div>;
}
