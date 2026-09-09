import type { Metadata } from "next";
import MorseCodeConverter from "../components/morse-code-converter";

export const metadata: Metadata = { title: "摩斯电码转换 | 多功能工具箱", description: "文字与摩斯电码互转并提供标准速度试听。" };
export default function Page() { return <MorseCodeConverter />; }
