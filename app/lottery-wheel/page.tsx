import type { Metadata } from "next";
import LotteryWheel from "../components/lottery-wheel";

export const metadata: Metadata = { title: "抽签大转盘 | 多功能工具箱", description: "支持导入TXT、CSV与Excel抽奖名单，随机抽签和导出抽签记录。" };
export default function Page() { return <LotteryWheel />; }
