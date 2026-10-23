import type { Metadata } from "next";
import RegexTester from "../components/regex-tester";
export const metadata: Metadata = { title: "正则表达式测试 | 多功能工具箱", description: "本地测试正则表达式，查看匹配高亮、位置和捕获组。" };
export default function Page() { return <RegexTester />; }
