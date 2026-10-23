import type { Metadata } from "next";
import SecretGenerator from "../components/secret-generator";
export const metadata: Metadata = { title: "密码与 UUID 生成 | 多功能工具箱", description: "本地生成安全随机密码与 UUID v4，支持批量复制和 TXT 导出。" };
export default function Page() { return <SecretGenerator />; }
