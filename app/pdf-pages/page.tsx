import type { Metadata } from "next";
import Tool from "../components/pdf-page-manager";
export const metadata: Metadata = {
  title: "PDF 页面管理 | 多功能工具箱",
  description: "合并、拆分、删除、排序和旋转 PDF 页面。",
};
export default function Page() {
  return <Tool />;
}
