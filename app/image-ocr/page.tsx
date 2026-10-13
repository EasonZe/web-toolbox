import type { Metadata } from "next";
import Tool from "../components/image-ocr";
export const metadata: Metadata = {
  title: "图片文字识别 OCR | 多功能工具箱",
  description: "本地识别中英文图片文字，支持复制和导出。",
};
export default function Page() {
  return <Tool />;
}
