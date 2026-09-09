import type { Metadata } from "next";
import LotteryWheel from "../components/lottery-wheel";

export const metadata: Metadata = { title: "抽签与随机选择 | 多功能工具箱", description: "支持大转盘、翻牌和名单滚动，导入TXT、CSV与Excel名单并导出抽签记录。" };
export default function Page() { return <LotteryWheel />; }
