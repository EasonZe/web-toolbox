import type { Metadata } from "next";
import { UnicodeInspector as Tool } from "../components/text-workbenches";
export const metadata: Metadata = {
  title: "Unicode 字符检查 | 多功能工具箱",
  description: "查看字符编码，检测零宽字符和隐藏空格。",
};
export default function Page() {
  return <Tool />;
}
