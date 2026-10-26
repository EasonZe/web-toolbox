import type { Metadata } from "next";
import CronPreviewTool from "../components/cron-preview";
export const metadata: Metadata = { title: "Cron 表达式预览 | 多功能工具箱", description: "按 IANA 时区预览 Cron 后续执行时间，支持五段和六段含秒表达式。" };
export default function Page() { return <CronPreviewTool />; }
