import type { Metadata } from "next";
import IpLookup from "../components/ip-lookup";

export const metadata: Metadata = {
  title: "IP地址查询工具 | Eason的工具箱",
  description: "查询公网 IPv4 或 IPv6 的位置、运营商、ASN 与时区信息。",
};

export default function IpLookupPage() {
  return <IpLookup />;
}
