import { isIP } from "node:net";

type IpWhoResponse = {
  ip?: string;
  success?: boolean;
  message?: string;
  type?: string;
  continent?: string;
  continent_code?: string;
  country?: string;
  country_code?: string;
  region?: string;
  region_code?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  postal?: string;
  flag?: { emoji?: string };
  connection?: {
    asn?: number;
    org?: string;
    isp?: string;
    domain?: string;
  };
  timezone?: {
    id?: string;
    abbr?: string;
    is_dst?: boolean;
    utc?: string;
  };
};

type IpQueryResponse = {
  ip?: string;
  isp?: {
    asn?: string;
    org?: string;
    isp?: string;
  };
  location?: {
    country?: string;
    country_code?: string;
    city?: string;
    state?: string;
    zipcode?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
  };
};

type IpLookupData = {
  ip: string;
  type: string;
  flag: string;
  continent: string;
  continentCode: string;
  country: string;
  countryCode: string;
  region: string;
  regionCode: string;
  city: string;
  postal: string;
  latitude: number | null;
  longitude: number | null;
  asn: number | null;
  organization: string;
  isp: string;
  domain: string;
  timezone: string;
  timezoneAbbr: string;
  utcOffset: string;
  daylightSaving: boolean;
};

class ReservedIpError extends Error {}

const CONTINENT_NAMES: Record<string, string> = {
  AF: "非洲",
  AN: "南极洲",
  AS: "亚洲",
  EU: "欧洲",
  NA: "北美洲",
  OC: "大洋洲",
  SA: "南美洲",
};

const CHINA_REGION_NAMES: Record<string, string> = {
  anhui: "安徽省",
  beijing: "北京市",
  chongqing: "重庆市",
  fujian: "福建省",
  gansu: "甘肃省",
  guangdong: "广东省",
  guangxi: "广西壮族自治区",
  guizhou: "贵州省",
  hainan: "海南省",
  hebei: "河北省",
  heilongjiang: "黑龙江省",
  henan: "河南省",
  hubei: "湖北省",
  hunan: "湖南省",
  "inner mongolia": "内蒙古自治区",
  jiangsu: "江苏省",
  jiangxi: "江西省",
  jilin: "吉林省",
  liaoning: "辽宁省",
  ningxia: "宁夏回族自治区",
  qinghai: "青海省",
  shaanxi: "陕西省",
  shandong: "山东省",
  shanghai: "上海市",
  shanxi: "山西省",
  sichuan: "四川省",
  tianjin: "天津市",
  tibet: "西藏自治区",
  xinjiang: "新疆维吾尔自治区",
  yunnan: "云南省",
  zhejiang: "浙江省",
};

const CHINA_CITY_NAMES: Record<string, string> = {
  beijing: "北京市",
  changsha: "长沙市",
  chengdu: "成都市",
  chongqing: "重庆市",
  dalian: "大连市",
  dongguan: "东莞市",
  foshan: "佛山市",
  fuzhou: "福州市",
  guangzhou: "广州市",
  guiyang: "贵阳市",
  haikou: "海口市",
  hangzhou: "杭州市",
  harbin: "哈尔滨市",
  hefei: "合肥市",
  huizhou: "惠州市",
  jinan: "济南市",
  kunming: "昆明市",
  lanzhou: "兰州市",
  nanchang: "南昌市",
  nanjing: "南京市",
  nanning: "南宁市",
  ningbo: "宁波市",
  qingdao: "青岛市",
  shanghai: "上海市",
  shenyang: "沈阳市",
  shenzhen: "深圳市",
  shijiazhuang: "石家庄市",
  suzhou: "苏州市",
  taiyuan: "太原市",
  tianjin: "天津市",
  urumqi: "乌鲁木齐市",
  wuhan: "武汉市",
  wuxi: "无锡市",
  xiamen: "厦门市",
  xian: "西安市",
  "xi'an": "西安市",
  zhengzhou: "郑州市",
  zhuhai: "珠海市",
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function getVisitorIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const candidate =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    forwarded ??
    "";
  const normalized = candidate.trim().replace(/^::ffff:/i, "");
  return isIP(normalized) ? normalized : "";
}

async function fetchJson<T>(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function countryFlag(countryCode = "") {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...[...code].map((character) => 127397 + character.charCodeAt(0)),
  );
}

function hasChinese(value = "") {
  return /[\u3400-\u9fff]/u.test(value);
}

function normalizeLocationKey(value = "") {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+(province|region|city|municipality|autonomous region)$/u, "")
    .replace(/\s+/gu, " ");
}

function localizedCountry(countryCode = "", fallback = "—") {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return fallback || "—";

  try {
    return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(code) ?? fallback;
  } catch {
    return fallback || "—";
  }
}

function localizedContinent(continentCode = "", fallback = "—") {
  return CONTINENT_NAMES[continentCode.trim().toUpperCase()] ?? (fallback || "—");
}

function localizedChinaLocation(
  value: string | undefined,
  dictionary: Record<string, string>,
) {
  const original = value?.trim() || "—";
  if (original === "—" || hasChinese(original)) return original;
  return dictionary[normalizeLocationKey(original)] ?? original;
}

function localizedNetworkName(value: string | undefined) {
  const original = value?.trim() || "—";
  const translations: Array<[RegExp, string]> = [
    [/china mobile/i, "中国移动"],
    [/china telecom/i, "中国电信"],
    [/china unicom/i, "中国联通"],
    [/china education and research network|cernet/i, "中国教育和科研计算机网"],
    [/alibaba/i, "阿里巴巴"],
    [/tencent/i, "腾讯"],
    [/huawei/i, "华为"],
  ];
  return translations.find(([pattern]) => pattern.test(original))?.[1] ?? original;
}

function localizedIpType(ip: string) {
  const version = isIP(ip);
  return version ? `IPv${version} 地址` : "未知地址类型";
}

function timezoneName(timezone?: string) {
  if (!timezone) return "—";

  try {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      timeZoneName: "long",
    });
    return (
      formatter
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? timezone
    );
  } catch {
    return timezone;
  }
}

function timezoneDetails(timezone?: string) {
  if (!timezone) return { abbreviation: "", offset: "—" };

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    });
    const parts = Object.fromEntries(
      formatter
        .formatToParts(now)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const localizedTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const offsetMinutes = Math.round((localizedTime - now.getTime()) / 60000);
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absoluteMinutes = Math.abs(offsetMinutes);
    const offset = `${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, "0")}:${String(absoluteMinutes % 60).padStart(2, "0")}`;
    return { abbreviation: parts.timeZoneName ?? "", offset };
  } catch {
    return { abbreviation: "", offset: "—" };
  }
}

async function lookupWithIpWhois(targetIp: string): Promise<IpLookupData | null> {
  const data = await fetchJson<IpWhoResponse>(
    `https://ipwho.is/${encodeURIComponent(targetIp)}?lang=zh-CN`,
  );
  if (!data) return null;
  if (data.message === "Reserved range") throw new ReservedIpError();
  if (!data.success || !data.ip) return null;

  return {
    ip: data.ip,
    type: localizedIpType(data.ip),
    flag: data.flag?.emoji ?? countryFlag(data.country_code),
    continent: localizedContinent(data.continent_code, data.continent),
    continentCode: data.continent_code ?? "",
    country: localizedCountry(data.country_code, data.country),
    countryCode: data.country_code ?? "",
    region:
      data.country_code?.toUpperCase() === "CN"
        ? localizedChinaLocation(data.region, CHINA_REGION_NAMES)
        : data.region ?? "—",
    regionCode: data.region_code ?? "",
    city:
      data.country_code?.toUpperCase() === "CN"
        ? localizedChinaLocation(data.city, CHINA_CITY_NAMES)
        : data.city ?? "—",
    postal: data.postal ?? "—",
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    asn: data.connection?.asn ?? null,
    organization: localizedNetworkName(data.connection?.org),
    isp: localizedNetworkName(data.connection?.isp),
    domain: data.connection?.domain ?? "—",
    timezone: timezoneName(data.timezone?.id),
    timezoneAbbr: "",
    utcOffset: data.timezone?.utc ?? "—",
    daylightSaving: data.timezone?.is_dst ?? false,
  };
}

async function lookupWithIpQuery(targetIp: string): Promise<IpLookupData | null> {
  const data = await fetchJson<IpQueryResponse>(
    `https://api.ipquery.io/${encodeURIComponent(targetIp)}`,
  );
  if (!data?.ip || !isIP(data.ip)) return null;

  const countryCode = data.location?.country_code ?? "";
  const timezone = data.location?.timezone;
  const timezoneInfo = timezoneDetails(timezone);
  const asn = Number(data.isp?.asn?.replace(/^AS/i, ""));

  return {
    ip: data.ip,
    type: localizedIpType(data.ip),
    flag: countryFlag(countryCode),
    continent: "—",
    continentCode: "",
    country: localizedCountry(countryCode, data.location?.country),
    countryCode,
    region:
      countryCode.toUpperCase() === "CN"
        ? localizedChinaLocation(data.location?.state, CHINA_REGION_NAMES)
        : data.location?.state ?? "—",
    regionCode: "",
    city:
      countryCode.toUpperCase() === "CN"
        ? localizedChinaLocation(data.location?.city, CHINA_CITY_NAMES)
        : data.location?.city ?? "—",
    postal: data.location?.zipcode ?? "—",
    latitude: data.location?.latitude ?? null,
    longitude: data.location?.longitude ?? null,
    asn: Number.isFinite(asn) ? asn : null,
    organization: localizedNetworkName(data.isp?.org),
    isp: localizedNetworkName(data.isp?.isp),
    domain: "—",
    timezone: timezoneName(timezone),
    timezoneAbbr: timezoneInfo.abbreviation,
    utcOffset: timezoneInfo.offset,
    daylightSaving: false,
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const suppliedIp = requestUrl.searchParams.get("ip")?.trim() ?? "";

  if (suppliedIp && !isIP(suppliedIp)) {
    return json(
      { success: false, error: "请输入有效的 IPv4 或 IPv6 地址。" },
      400,
    );
  }

  const targetIp = suppliedIp || getVisitorIp(request);
  if (!targetIp) {
    return json(
      { success: false, error: "暂时无法识别当前公网 IP，请手动输入后查询。" },
      400,
    );
  }

  try {
    let data: IpLookupData | null = null;
    try {
      data = await lookupWithIpWhois(targetIp);
    } catch (error) {
      if (error instanceof ReservedIpError) throw error;
    }

    if (!data) {
      try {
        data = await lookupWithIpQuery(targetIp);
      } catch {
        data = null;
      }
    }

    if (!data) {
      return json(
        { success: false, error: "IP 数据服务暂时不可用，请稍后再试。" },
        502,
      );
    }

    return json({ success: true, data });
  } catch (error) {
    if (error instanceof ReservedIpError) {
      return json(
        { success: false, error: "这是保留或局域网 IP，无法查询公网位置。" },
        404,
      );
    }
    return json(
      {
        success: false,
        error:
          error instanceof Error && error.name === "AbortError"
            ? "查询超时，请稍后重试。"
            : "查询失败，请检查网络后重试。",
      },
      502,
    );
  }
}
