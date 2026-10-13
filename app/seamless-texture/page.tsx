import type { Metadata } from "next";
import { SeamlessChecker as Tool } from "../components/texture-tools";
export const metadata: Metadata = {
  title: "无缝贴图检查器 | 多功能工具箱",
  description: "重复平铺、缩放与接缝辅助线预览。",
};
export default function Page() {
  return <Tool />;
}
