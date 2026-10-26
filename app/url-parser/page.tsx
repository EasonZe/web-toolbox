import type { Metadata } from "next";
import UrlParser from "../components/url-parser";
export const metadata: Metadata = { title: "URL 解析与参数编辑 | 多功能工具箱", description: "本地拆解 HTTP / HTTPS URL，查看与编辑重复查询参数、片段和追踪参数。" };
export default function Page() { return <UrlParser />; }
