import type { Metadata } from "next";
import CidrCalculator from "../components/cidr-calculator";
export const metadata: Metadata = { title: "IP / CIDR 子网计算 | 多功能工具箱", description: "本地计算 IPv4 / IPv6 网络范围、掩码、地址数量和地址归属。" };
export default function Page() { return <CidrCalculator />; }
