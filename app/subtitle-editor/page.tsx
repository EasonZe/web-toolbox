import type { Metadata } from "next";
import Tool from "../components/subtitle-editor";
export const metadata: Metadata = {
  title: "字幕编辑与转换 | 多功能工具箱",
  description: "SRT 与 VTT 互转、编辑文字并整体调整时间。",
};
export default function Page() {
  return <Tool />;
}
