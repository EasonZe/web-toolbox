import type { Metadata } from "next";
import JwtInspector from "../components/jwt-inspector";
export const metadata: Metadata = { title: "JWT 解析 | 多功能工具箱", description: "本地解码 JWT 头部、载荷和时间声明，不上传令牌。" };
export default function Page() { return <JwtInspector />; }
