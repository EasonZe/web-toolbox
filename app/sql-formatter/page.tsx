import type { Metadata } from "next";
import SqlFormatter from "../components/sql-formatter";
export const metadata: Metadata = { title: "SQL 格式化 | 多功能工具箱", description: "本地格式化 SQL，支持常用数据库方言、关键词大小写、缩进和 SQL 导出。" };
export default function Page() { return <SqlFormatter />; }
