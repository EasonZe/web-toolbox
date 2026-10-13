import type { Metadata } from "next";
import { JsonFormatter as Tool } from "../components/text-workbenches";
export const metadata: Metadata = {
  title: "JSON 格式化与校验 | 多功能工具箱",
  description: "格式化、压缩 JSON 并定位语法错误。",
};
export default function Page() {
  return <Tool />;
}
