import type { Metadata } from "next";
import TextFormatConverter from "../components/text-format-converter";

export const metadata: Metadata = {
  title: "文本格式转换工具 | 多功能工具箱",
  description: "转换英文命名格式、简繁体、全半角，并整理文本行和空白。",
};

export default function TextFormatPage() {
  return <TextFormatConverter />;
}
