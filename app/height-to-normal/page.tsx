import type { Metadata } from "next";
import { HeightNormal as Tool } from "../components/texture-tools";
export const metadata: Metadata = {
  title: "高度图转法线图 | 多功能工具箱",
  description: "调节强度、反转方向并导出 PNG 法线图。",
};
export default function Page() {
  return <Tool />;
}
