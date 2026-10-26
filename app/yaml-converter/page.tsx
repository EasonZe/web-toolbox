import type { Metadata } from "next";
import YamlConverter from "../components/yaml-converter";
export const metadata: Metadata = { title: "YAML / JSON 互转 | 多功能工具箱", description: "本地转换 YAML 和 JSON 配置，严格校验语法、字段、类型与别名。" };
export default function Page() { return <YamlConverter />; }
