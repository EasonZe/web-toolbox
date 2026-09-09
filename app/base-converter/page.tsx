import type { Metadata } from "next";
import BaseConverter from "../components/base-converter";

export const metadata: Metadata = { title: "进制转换器 | 多功能工具箱", description: "在 2 至 36 进制之间转换任意长度整数。" };
export default function Page() { return <BaseConverter />; }
