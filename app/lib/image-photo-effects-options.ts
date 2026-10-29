export type DuotoneOptions = { kind: "duotone"; shadow: string; highlight: string; strength: number };
export type SharpenOptions = { kind: "sharpen"; radius: number; amount: number; threshold: number };
export type PhotoEffectOptions = DuotoneOptions | SharpenOptions;
export type PhotoEffectKind = PhotoEffectOptions["kind"];
export const defaultDuotone: DuotoneOptions = { kind: "duotone", shadow: "#142850", highlight: "#F9D976", strength: 100 };
export const defaultSharpen: SharpenOptions = { kind: "sharpen", radius: 2, amount: 100, threshold: 3 };
export function validatePhotoEffect(options: PhotoEffectOptions) {
  if (!options || !["duotone", "sharpen"].includes(options.kind)) throw new Error("图片效果类型无效。");
  if (options.kind === "duotone") {
    if (!/^#[\da-f]{6}$/i.test(options.shadow) || !/^#[\da-f]{6}$/i.test(options.highlight)) throw new Error("颜色须为六位十六进制颜色，例如 #2563EB。");
    if (!Number.isFinite(options.strength) || options.strength < 0 || options.strength > 100) throw new Error("双色调强度须为 0–100%。");
  } else if (!Number.isSafeInteger(options.radius) || options.radius < 1 || options.radius > 12 || !Number.isFinite(options.amount) || options.amount < 0 || options.amount > 300 || !Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 64) throw new Error("锐化半径须为 1–12px，强度为 0–300%，阈值为 0–64。");
  return options;
}
