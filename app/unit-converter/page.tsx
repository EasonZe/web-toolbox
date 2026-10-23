import type { Metadata } from "next";
import UnitConverter from "../components/unit-converter";
export const metadata: Metadata = { title: "单位换算 | 多功能工具箱", description: "长度、面积、体积、质量、温度、速度、压力、能量、功率、时间和数据容量换算。" };
export default function Page() { return <UnitConverter />; }
