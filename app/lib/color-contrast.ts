export function contrastHex(input: string) {
  let value = input.trim().replace(/^#/, "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) throw new Error("请输入 3 位或 6 位 HEX 色值，例如 #336699。");
  if (value.length === 3) value = [...value].map((c) => c + c).join("");
  return `#${value.toUpperCase()}`;
}
function rgb(hex: string) { return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255); }
export function contrastRatio(foreground: number[], background: number[]) {
  if ([foreground, background].some((color) => color.length !== 3 || color.some((v) => !Number.isFinite(v) || v < 0 || v > 1))) throw new Error("颜色通道无效。");
  function luminance(color: number[]) { return color.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0); }
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function inspectContrast(foreground: string, background: string, opacity: number) {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) throw new Error("文字不透明度须为 0–100%。");
  const front = contrastHex(foreground), back = contrastHex(background), alpha = opacity / 100;
  const bg = rgb(back), effective = rgb(front).map((v, index) => v * alpha + bg[index] * (1 - alpha));
  const ratio = contrastRatio(effective, bg);
  return { foreground: front, background: back, effective: `rgb(${effective.map((v) => (v * 255).toFixed(3)).join(" ")})`, css: `color: rgb(${rgb(front).map((v) => Math.round(v * 255)).join(" ")} / ${alpha});\nbackground-color: ${back};`, ratio,
    checks: [
      { label: "普通文字 AA", minimum: 4.5, pass: ratio >= 4.5 },
      { label: "普通文字 AAA", minimum: 7, pass: ratio >= 7 },
      { label: "大号文字 AA", minimum: 3, pass: ratio >= 3 },
      { label: "大号文字 AAA", minimum: 4.5, pass: ratio >= 4.5 },
      { label: "图形 / 控件对比度", minimum: 3, pass: ratio >= 3 },
    ],
  };
}
