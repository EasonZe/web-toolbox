import type { Metadata } from "next";
import TypingTest from "../components/typing-test";
export const metadata: Metadata = { title: "打字速度测试 | 多功能工具箱", description: "中英文与自定义文本打字练习，统计准确率、正确字符速度与 WPM。" };
export default function Page() { return <TypingTest />; }
