import type { Metadata } from "next";
import { ZipTool as Tool } from "../components/archive-tools";
export const metadata: Metadata = {
  title: "ZIP 打包与解压 | 多功能工具箱",
  description: "文件列表预览、单独提取与打包下载全部文件。",
};
export default function Page() {
  return <Tool />;
}
