export type BlurRegion = { left: number; top: number; width: number; height: number };
export type ImageBlurOptions = { scope: "all" | "region"; radius: number; strength: number; region: BlurRegion };
export const defaultImageBlur: ImageBlurOptions = { scope: "all", radius: 12, strength: 100, region: { left: 25, top: 25, width: 50, height: 50 } };

export function validateImageBlur(options: ImageBlurOptions) {
  if (!options || !["all", "region"].includes(options.scope) || !Number.isInteger(options.radius) || options.radius < 1 || options.radius > 100 || !Number.isFinite(options.strength) || options.strength < 0 || options.strength > 100) throw new Error("模糊参数无效：半径为 1–100px，强度为 0–100%。");
  const r = options.region;
  if (!r || ![r.left, r.top, r.width, r.height].every(Number.isFinite) || r.left < 0 || r.top < 0 || r.width <= 0 || r.height <= 0 || r.left + r.width > 100 + 1e-9 || r.top + r.height > 100 + 1e-9) throw new Error("局部范围无效：宽高必须大于 0%，左侧加宽度、顶部加高度不能超过 100%。");
}

export function imageBlurRegion(width: number, height: number, options: ImageBlurOptions) {
  validateImageBlur(options);
  if (options.scope === "all") return { left: 0, top: 0, right: width, bottom: height };
  return { left: Math.max(0, Math.floor(width * options.region.left / 100)), top: Math.max(0, Math.floor(height * options.region.top / 100)), right: Math.min(width, Math.ceil(width * (options.region.left + options.region.width) / 100)), bottom: Math.min(height, Math.ceil(height * (options.region.top + options.region.height) / 100)) };
}
