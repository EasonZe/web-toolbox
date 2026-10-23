import type { Metadata } from "next";
import TextCodec from "../components/text-codec";
export const metadata: Metadata = { title: "文本编码与解码 | 多功能工具箱", description: "Base64、Base64URL、URL 参数、HTML 实体与 Unicode 转义，本地双向转换。" };
export default function Page() { return <TextCodec />; }
