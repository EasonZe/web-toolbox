import type { Metadata } from "next";
import ImageTextEditor from "../components/image-text-editor";

export const metadata: Metadata = {
  title: "图片加文字与对话框工具 | 多功能工具箱",
  description: "为图片添加文字与多种对话框并导出。",
};

export default function Page() {
  return <ImageTextEditor />;
}
