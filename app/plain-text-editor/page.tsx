import type { Metadata } from "next";
import PlainTextEditor from "../components/plain-text-editor";

export const metadata: Metadata = {
  title: "纯文本编辑器 | 多功能工具箱",
  description: "在浏览器中打开、编辑、查找替换并下载纯文本文件。",
};

export default function PlainTextEditorPage() {
  return <PlainTextEditor />;
}
