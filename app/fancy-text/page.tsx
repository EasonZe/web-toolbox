import type { Metadata } from "next";
import FancyTextConverter from "../components/fancy-text-converter";

export const metadata: Metadata = {
  title: "花体字转换器 | 多功能工具箱",
  description: "将英文、数字和符号转换为双线体、花体、粗体、圆圈字等Unicode样式。",
};

export default function FancyTextPage() {
  return <FancyTextConverter />;
}
