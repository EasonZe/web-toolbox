import { NextRequest, NextResponse } from "next/server";
import { currencyCodes } from "../../lib/currency";

type RateRow = { date?: string; base?: string; quote?: string; rate?: number };

export async function GET(request: NextRequest) {
  const base = (request.nextUrl.searchParams.get("base") || "CNY").toUpperCase();
  const quote = (request.nextUrl.searchParams.get("quote") || "USD").toUpperCase();
  if (!currencyCodes.has(base) || !currencyCodes.has(quote)) return NextResponse.json({ error: "不支持的货币代码。" }, { status: 400 });
  if (base === quote) return NextResponse.json({ base, quote, rate: 1, date: new Date().toISOString().slice(0, 10), fetchedAt: Date.now() }, { headers: { "Cache-Control": "public, max-age=300" } });

  try {
    const upstream = await fetch(`https://api.frankfurter.dev/v2/rates?base=${base}&quotes=${quote}`, { headers: { Accept: "application/json" } });
    if (!upstream.ok) throw new Error(`上游返回 ${upstream.status}`);
    const rows = await upstream.json() as RateRow[];
    const row = rows.find((item) => item.base === base && item.quote === quote);
    if (!row?.rate || !row.date) throw new Error("未找到货币对");
    return NextResponse.json({ base, quote, rate: row.rate, date: row.date, fetchedAt: Date.now(), source: "Frankfurter" }, {
      headers: { "Cache-Control": "public, max-age=900, s-maxage=1800, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "暂时无法取得最新汇率，请稍后重试。" }, { status: 502 });
  }
}
