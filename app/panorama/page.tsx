import type { Metadata } from "next";
import Tool from "../components/panorama-viewer";
export const metadata: Metadata = {
  title: "360° 全景图预览 | 多功能工具箱",
  description: "拖动视角、缩放预览等距柱状全景图片。",
};
export default function Page() {
  return <Tool />;
}
