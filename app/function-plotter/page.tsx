import type { Metadata } from "next";
import FunctionPlotter from "../components/function-plotter";

export const metadata: Metadata = { title: "函数图像绘制 | 多功能工具箱", description: "绘制可缩放和拖动的二维数学函数图像。" };
export default function Page() { return <FunctionPlotter />; }
