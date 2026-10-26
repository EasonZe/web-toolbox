import ipaddr from "ipaddr.js";
const zero = BigInt(0), one = BigInt(1), two = BigInt(2), byteBase = BigInt(256), byteMask = BigInt(255);

function parseAddress(input: string) {
  const value = input.trim();
  if (!value || value.length > 200 || /[%/\s]/.test(value)) throw new Error("请输入不带端口或区域标识的 IPv4 / IPv6 地址。");
  const tail = value.includes(".") ? value.slice(value.lastIndexOf(":") + 1) : "";
  if (tail && (!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(tail) || !ipaddr.IPv4.isValidFourPartDecimal(tail))) throw new Error("IPv4 须使用四段十进制，不接受缩写、八进制或十六进制。");
  if (!value.includes(":") && !tail) throw new Error("请输入有效 IP 地址，不接受域名或整数地址。");
  try { return ipaddr.parse(value); } catch { throw new Error("IP 地址格式无效。"); }
}
const asInteger = (address: ReturnType<typeof parseAddress>) => address.toByteArray().reduce((value, byte) => value * byteBase + BigInt(byte), zero);
function asAddress(value: bigint, bits: number) {
  const bytes = Array.from({ length: bits / 8 }, (_, index) => Number((value >> BigInt(bits - 8 - index * 8)) & byteMask));
  return ipaddr.fromByteArray(bytes).toString();
}
const ranges: Record<string, string> = { unicast: "普通单播（不代表一定可公网访问）", private: "私有地址", uniqueLocal: "唯一本地地址", loopback: "回环地址", linkLocal: "链路本地", multicast: "组播地址", unspecified: "未指定地址", broadcast: "受限广播", carrierGradeNat: "运营商共享地址", reserved: "保留 / 文档地址", ipv4Mapped: "IPv4 映射 IPv6", benchmarking: "基准测试地址" };
export function inspectCidr(input: string, query = "") {
  const pieces = input.trim().split("/"); if (pieces.length > 2) throw new Error("CIDR 只能包含一个斜线。");
  const address = parseAddress(pieces[0]), bits = address.kind() === "ipv4" ? 32 : 128;
  if (pieces.length === 2 && !/^(0|[1-9]\d{0,2})$/.test(pieces[1])) throw new Error("前缀长度须为十进制整数。");
  const prefix = pieces.length === 2 ? Number(pieces[1]) : bits;
  if (prefix > bits) throw new Error(`此前缀长度须为 0–${bits}。`);
  const count = one << BigInt(bits - prefix), mask = ((one << BigInt(bits)) - one) ^ (count - one), low = asInteger(address) & mask, high = low + count - one;
  const range = address.range(), network = asAddress(low, bits), last = asAddress(high, bits);
  const expanded = bits === 128 ? address.toByteArray().reduce<string[]>((groups, byte, index, bytes) => { if (index % 2 === 0) groups.push((byte * 256 + bytes[index + 1]).toString(16).padStart(4, "0")); return groups; }, []).join(":") : address.toString();
  const rows: [string, string][] = [["地址族", `IPv${bits === 32 ? 4 : 6}`], ["输入地址", address.toString()], ["完整表示", expanded], ["输入地址分类", ranges[range] ?? range], ["网络 CIDR", `${network}/${prefix}`], ["前缀长度", String(prefix)], ["地址总数", count.toString()], ["范围起点", network], [bits === 32 ? prefix <= 30 ? "范围终点 / 广播地址" : "范围终点" : "范围终点（IPv6 无广播）", last], ["子网掩码", asAddress(mask, bits)]];
  if (bits === 32) {
    rows.push(["反掩码", asAddress(count - one, bits)], ["可用数量（常规约定）", (prefix <= 30 ? count - two : count).toString()], ["可用起点", asAddress(prefix <= 30 ? low + one : low, bits)], ["可用终点", asAddress(prefix <= 30 ? high - one : high, bits)]);
  }
  let contains: boolean | null = null;
  if (query.trim()) { const candidate = parseAddress(query); contains = candidate.kind() === address.kind() && (asInteger(candidate) & mask) === low; rows.push(["查询地址", candidate.toString()], ["是否在子网内", contains ? "是" : candidate.kind() === address.kind() ? "否" : "否（地址族不同）"]); }
  return { bits, prefix, network, last, count: count.toString(), contains, rows, text: rows.map(([name, value]) => `${name}：${value}`).join("\n") };
}
