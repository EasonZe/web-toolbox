import type { Metadata } from "next";
import JsonPointer from "../components/json-pointer";
export const metadata: Metadata = { title: "JSON 路径提取 | 多功能工具箱", description: "按 JSON Pointer 路径批量提取字段与数组元素，保留原始数字，支持复制和下载。" };
export default function Page() { return <JsonPointer />; }
