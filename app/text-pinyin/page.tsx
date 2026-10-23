import type { Metadata } from "next";
import TextPinyin from "../components/text-pinyin";
export const metadata: Metadata = { title: "汉字转拼音 | 多功能工具箱", description: "汉字转换为声调拼音、数字声调、无声调和首字母，支持姓氏模式。" };
export default function Page() { return <TextPinyin />; }
