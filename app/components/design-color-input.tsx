"use client";
import { designColor } from "../lib/design-generator-options";
export function DesignColorInput({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  let color = "#000000"; try { color = designColor(value); } catch { /* Keep the invalid text editable. */ }
  return <div className="contrast-color-input"><label>{label}<input value={value} maxLength={7} spellCheck={false} onChange={(e) => onChange(e.target.value)} placeholder="#336699" /></label><input type="color" aria-label={`${label}取色`} value={color} onChange={(e) => onChange(e.target.value)} /></div>;
}
