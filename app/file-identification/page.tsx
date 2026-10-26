import type { Metadata } from "next";
import FileIdentificationTool from "../components/file-identification";
export const metadata: Metadata = { title: "文件真实类型识别 | 多功能工具箱", description: "通过二进制文件头识别格式、检查扩展名，批量采样并导出本地报告。" };
export default function Page() { return <FileIdentificationTool />; }
