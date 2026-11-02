import type { Metadata } from "next";
import Pomodoro from "../components/pomodoro";

export const metadata: Metadata = { title: "番茄专注钟 | 多功能工具箱", description: "可配置专注、短休息、长休息和轮次的本地番茄钟，支持暂停、跳过与提示音。" };
export default function Page() { return <Pomodoro />; }
