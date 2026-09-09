import type { Metadata } from "next";
import BeadPatternGenerator from "../components/bead-pattern-generator";

export const metadata: Metadata = {
  title: "拼豆图纸生成工具 | 多功能工具箱",
  description: "将图片转换为带网格、编号和用量统计的拼豆图纸。",
};

export default function Page() {
  return <BeadPatternGenerator />;
}
