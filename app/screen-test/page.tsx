import type { Metadata } from "next";
import ScreenColorTest from "../components/screen-color-test";

export const metadata: Metadata = { title: "屏幕纯色测试 | 多功能工具箱", description: "全屏纯色检查坏点、色偏与背光均匀度。" };
export default function Page() { return <ScreenColorTest />; }
