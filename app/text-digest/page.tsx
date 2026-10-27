import type { Metadata } from "next";
import TextDigest from "../components/text-digest";
export const metadata: Metadata = { title: "文本哈希与 HMAC | 多功能工具箱", description: "本地计算 UTF-8 或 Hex 内容的 SHA 摘要与 HMAC，输出 Hex、Base64 并核对结果。" };
export default function Page() { return <TextDigest />; }
