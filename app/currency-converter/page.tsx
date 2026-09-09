import type { Metadata } from "next";
import CurrencyConverter from "../components/currency-converter";

export const metadata: Metadata = { title: "实时汇率转换 | 多功能工具箱", description: "使用最新机构参考汇率转换常用全球货币。" };
export default function Page() { return <CurrencyConverter />; }
