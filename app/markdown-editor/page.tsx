import type { Metadata } from "next";
import { MarkdownEditor as Tool } from "../components/text-workbenches";
export const metadata: Metadata = {
  title: "Markdown 编辑与预览 | 多功能工具箱",
  description: "实时编辑 Markdown 并导出 Markdown 或 HTML。",
};
export default function Page() {
  return <Tool />;
}
