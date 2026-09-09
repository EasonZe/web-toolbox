import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ serverTime: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
