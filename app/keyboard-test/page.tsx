import type { Metadata } from "next";
import KeyboardTester from "../components/keyboard-tester";

export const metadata: Metadata = { title: "键盘按键测试 | 多功能工具箱", description: "检测键盘按键触发、长按重复与多键同按。" };
export default function Page() { return <KeyboardTester />; }
