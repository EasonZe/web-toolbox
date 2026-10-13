import type { Metadata } from "next";
import { ChannelPacker as Tool } from "../components/texture-tools";
export const metadata: Metadata = {
  title: "贴图通道打包 | 多功能工具箱",
  description: "自定义 RGBA 来源、反转通道并导出 PNG。",
};
export default function Page() {
  return <Tool />;
}
