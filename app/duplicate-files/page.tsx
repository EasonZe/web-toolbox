import type { Metadata } from "next";
import DuplicateFiles from "../components/duplicate-files";
export const metadata: Metadata = { title: "重复文件检查 | 多功能工具箱", description: "按大小、SHA-256 和逐字节对比查找重复文件，本地只读检查与 JSON 报告。" };
export default function Page() { return <DuplicateFiles />; }
