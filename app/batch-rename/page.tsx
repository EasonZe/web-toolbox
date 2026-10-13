import type { Metadata } from "next";
import { BatchRename as Tool } from "../components/archive-tools";
export const metadata: Metadata = {
  title: "批量文件重命名 | 多功能工具箱",
  description: "序号、替换、日期、名称预览并打包下载。",
};
export default function Page() {
  return <Tool />;
}
