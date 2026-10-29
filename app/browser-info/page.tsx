import type { Metadata } from "next";
import BrowserInfo from "../components/browser-info";
export const metadata: Metadata = { title: "浏览器信息与能力检测 | 多功能工具箱", description: "本地解析 User-Agent，主动检查当前浏览器 API 是否暴露，支持复制和导出 JSON，不请求权限。" };
export default function Page() { return <BrowserInfo />; }
