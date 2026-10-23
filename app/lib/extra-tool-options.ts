// Lightweight UI definitions: processing libraries remain inside the file Worker.
export type CodecMode = "base64" | "base64url" | "url" | "form" | "html" | "unicode";
export const codecModes: { id: CodecMode; label: string; hint: string }[] = [
  { id: "base64", label: "Base64", hint: "UTF-8 文本与标准 Base64 互转，不是加密。" },
  { id: "base64url", label: "Base64URL", hint: "使用 - 和 _，编码时不添加末尾 =。" },
  { id: "url", label: "URL 参数", hint: "按单个参数编码；空格为 %20，+ 保持为加号。不是整条网址编码。" },
  { id: "form", label: "表单参数", hint: "application/x-www-form-urlencoded；空格为 +，原始加号为 %2B。" },
  { id: "html", label: "HTML 实体", hint: "支持 HTML 命名实体和数字实体；结果仅作为文本显示，不执行 HTML。" },
  { id: "unicode", label: "Unicode 转义", hint: "使用 \\uXXXX / \\u{XXXXX}，不执行 JavaScript，也不处理其他反斜杠转义。" },
];
export type PinyinOptions = { tone: "symbol" | "num" | "none" | "initial"; separator: " " | "-" | ""; uppercase: boolean; surname: boolean };
export const defaultPinyinOptions: PinyinOptions = { tone: "symbol", separator: " ", uppercase: false, surname: false };
export type ImagePdfOptions = { page: "a4" | "a5" | "letter" | "image"; orientation: "auto" | "portrait" | "landscape"; margin: number; dpi: number; format: "png" | "jpeg"; quality: number; edge: number };
export const defaultImagePdfOptions: ImagePdfOptions = { page: "a4", orientation: "auto", margin: 10, dpi: 96, format: "jpeg", quality: 0.92, edge: 0 };
