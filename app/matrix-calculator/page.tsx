import type { Metadata } from "next";
import ScientificTool from "../components/scientific-tool";

export const metadata: Metadata = { title: "矩阵运算 | 多功能工具箱", description: "通过表格输入矩阵，计算加法、乘法、行列式、逆矩阵和转置。" };
export default function Page() { return <ScientificTool key="matrix" mode="matrix" />; }
