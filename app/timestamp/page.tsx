import type { Metadata } from "next";
import Tool from "../components/timestamp-converter";
export const metadata: Metadata = {
  title: "时间戳转换 | 多功能工具箱",
  description: "秒、毫秒、日期和 IANA 时区相互转换。",
};
export default function Page() {
  return <Tool />;
}
