import { contrastHex } from "./color-contrast";
export type GradientStop = { color: string; opacity: number; position: number };
export type GradientOptions = { angle: number; space: "rgb" | "oklab"; stops: GradientStop[] };
export const defaultGradientOptions: GradientOptions = { angle: 135, space: "oklab", stops: [{ color: "#2563EB", opacity: 100, position: 0 }, { color: "#22C1C3", opacity: 100, position: 100 }] };
export type ShadowLayer = { x: number; y: number; blur: number; spread: number; color: string; opacity: number; inset: boolean };
export const defaultShadowLayer: ShadowLayer = { x: 0, y: 12, blur: 32, spread: -8, color: "#1F3440", opacity: 24, inset: false };
export function designColor(value: string) { return contrastHex(value); }
export function colorRgba(hex: string, opacity: number) {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) throw new Error("不透明度须为 0–100%。");
  const color = designColor(hex);
  return `rgba(${[1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)).join(", ")}, ${Number((opacity / 100).toFixed(5))})`;
}
export function shadowCss(layers: ShadowLayer[], radius: number, surface: string, background: string) {
  if (!layers.length || layers.length > 6 || !Number.isFinite(radius) || radius < 0 || radius > 100) throw new Error("阴影须为 1–6 层，圆角须为 0–100px。");
  const value = layers.map((layer) => {
    if (![layer.x, layer.y, layer.blur, layer.spread].every(Number.isFinite) || Math.abs(layer.x) > 200 || Math.abs(layer.y) > 200 || layer.blur < 0 || layer.blur > 200 || Math.abs(layer.spread) > 100 || typeof layer.inset !== "boolean") throw new Error("偏移、模糊或扩展范围无效。");
    return `${layer.inset ? "inset " : ""}${layer.x}px ${layer.y}px ${layer.blur}px ${layer.spread}px ${colorRgba(layer.color, layer.opacity)}`;
  }).join(",\n  ");
  const box = designColor(surface), bg = designColor(background);
  return { value, surface: box, background: bg, radius, text: `.preview-background {\n  background-color: ${bg};\n}\n\n.preview-card {\n  background-color: ${box};\n  border-radius: ${radius}px;\n  box-shadow: ${value};\n}` };
}
export function addGradientStop(stops: GradientStop[]) {
  if (stops.length < 2 || stops.length >= 8) throw new Error("渐变色标须为 2–8 个。");
  let index = 0; for (let i = 1; i < stops.length - 1; i++) if (stops[i + 1].position - stops[i].position > stops[index + 1].position - stops[index].position) index = i;
  return [...stops.slice(0, index + 1), { color: "#FFFFFF", opacity: 100, position: Number(((stops[index].position + stops[index + 1].position) / 2).toFixed(4)) }, ...stops.slice(index + 1)];
}
