import type { Metadata } from "next";
import TableConverter from "../components/table-converter";
export const metadata: Metadata = { title: "CSV / JSON 表格转换 | 多功能工具箱", description: "CSV、TSV 与 JSON 本地双向转换，保留中文和长编号，支持表格预览。" };
export default function Page() { return <TableConverter />; }
