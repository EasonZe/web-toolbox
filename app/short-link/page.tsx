import type { Metadata } from "next";
import ShortLinkGenerator from "../components/short-link-generator";

export const metadata: Metadata = { title: "短链接生成工具 | 多功能工具箱", description: "生成可分享的短链接，支持自定义有效期。" };
export default function Page() { return <ShortLinkGenerator />; }
