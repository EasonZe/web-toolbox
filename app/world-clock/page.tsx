import type { Metadata } from "next";
import WorldClock from "../components/world-clock";

export const metadata: Metadata = { title: "全球实时时间 | 多功能工具箱", description: "查看全球IANA时区的实时时间，精确到秒并支持单时区全屏。" };
export default function Page() { return <WorldClock />; }
