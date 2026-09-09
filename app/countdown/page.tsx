import type { Metadata } from "next";
import CountdownTimer from "../components/countdown-timer";

export const metadata: Metadata = { title: "倒计时器 | 多功能工具箱", description: "按时长或目标时间创建可暂停、可全屏的精确倒计时。" };
export default function Page() { return <CountdownTimer />; }
