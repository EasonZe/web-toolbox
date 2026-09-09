import type { Metadata } from "next";
import WordCounter from "../components/word-counter";

export const metadata: Metadata = {
  title: "字数统计工具 | 多功能工具箱",
  description: "实时统计字符、词数、段落、行数和阅读时长。",
};

export default function Page() {
  return <WordCounter />;
}
