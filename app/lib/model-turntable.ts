export const MODEL_EXTENSIONS = ["glb", "gltf", "obj", "stl", "fbx"] as const;
export type ModelExtension = (typeof MODEL_EXTENSIONS)[number];

export const MAX_MODEL_BYTES = 120 * 1024 * 1024;

export function modelExtension(name: string): ModelExtension | "" {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  return MODEL_EXTENSIONS.includes(extension as ModelExtension) ? extension as ModelExtension : "";
}

export function validateModelFile(file: Pick<File, "name" | "size">) {
  if (!modelExtension(file.name)) return "仅支持 GLB、GLTF、OBJ、STL 和 FBX 模型";
  if (file.size <= 0) return "模型文件为空";
  if (file.size > MAX_MODEL_BYTES) return "模型文件不能超过 120 MB";
  return "";
}

export function parseModelResolution(value: string) {
  const match = /^(\d{3,4})x(\d{3,4})$/.exec(value);
  if (!match) throw new Error("无效的导出分辨率");
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 256 || height < 256 || width > 1920 || height > 1920) throw new Error("导出分辨率超出范围");
  return { width, height };
}

export function turntableOutputName(sourceName: string, mimeType: string) {
  const base = sourceName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-") || "3d-model";
  return `${base}-turntable.${mimeType.includes("mp4") ? "mp4" : "webm"}`;
}

export function formatModelDimension(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
