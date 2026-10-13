import type { Metadata } from "next";
import { TextDiff as Tool } from "../components/text-workbenches";
export const metadata: Metadata = {
  title: "文本差异对比 | 多功能工具箱",
  description: "左右对照文本，高亮增加、删除与修改。",
};
export default function Page() {
  return <Tool />;
}
