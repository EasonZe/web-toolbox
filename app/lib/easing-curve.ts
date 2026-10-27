import BezierEasing from "bezier-easing";
export type CurvePoints = [number, number, number, number];
export const easingPresets: { name: string; points: CurvePoints }[] = [
  { name: "linear", points: [0, 0, 1, 1] },
  { name: "ease", points: [0.25, 0.1, 0.25, 1] },
  { name: "ease-in", points: [0.42, 0, 1, 1] },
  { name: "ease-out", points: [0, 0, 0.58, 1] },
  { name: "ease-in-out", points: [0.42, 0, 0.58, 1] },
  { name: "轻微回弹", points: [0.68, -0.4, 0.32, 1.4] },
];
export function inspectEasing(points: CurvePoints, duration: number) {
  if (points.length !== 4 || points.some((v) => !Number.isFinite(v))) throw new Error("请输入四个有限的控制点数值。");
  if ([points[0], points[2]].some((v) => v < 0 || v > 1)) throw new Error("x1 和 x2 必须在 0～1 之间。");
  if ([points[1], points[3]].some((v) => v < -2 || v > 3)) throw new Error("本编辑器的 y1 和 y2 范围为 -2～3，允许超出 0～1 形成回弹。");
  if (!Number.isInteger(duration) || duration < 100 || duration > 10000) throw new Error("时长须为 100～10000 毫秒的整数。");
  const normalized = points.map((v) => Number(v.toFixed(4))) as CurvePoints;
  const easing = `cubic-bezier(${normalized.join(", ")})`;
  const evaluate = BezierEasing(...normalized);
  const minY = Math.min(0, normalized[1], normalized[3]) - 0.15, maxY = Math.max(1, normalized[1], normalized[3]) + 0.15;
  const plot = (x: number, y: number) => [28 + x * 304, 280 - (y - minY) / (maxY - minY) * 256];
  const start = plot(0, 0), end = plot(1, 1), first = plot(normalized[0], normalized[1]), second = plot(normalized[2], normalized[3]);
  const path = `M ${start.join(" ")} C ${first.join(" ")}, ${second.join(" ")}, ${end.join(" ")}`;
  return { easing, points: normalized, duration, start, end, first, second, path,
    samples: Array.from({ length: 11 }, (_, i) => ({ time: i / 10, progress: evaluate(i / 10) })),
    css: `.target {\n  transition: transform ${duration}ms ${easing};\n  animation-timing-function: ${easing};\n}\n`,
  };
}
