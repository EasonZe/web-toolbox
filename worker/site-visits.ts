import type { D1DatabaseBinding } from "./types";

type SiteVisitsEnv = {
  VISITS_DB: D1DatabaseBinding;
};

type VisitRow = {
  total: number;
};

const COUNTER_NAME = "site_visits";

const INCREMENT_SQL = `
  INSERT INTO site_counters (name, total)
  VALUES (?1, 1)
  ON CONFLICT(name) DO UPDATE SET total = site_counters.total + 1
  RETURNING total
`;

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}

export async function handleSiteVisits(request: Request, env: SiteVisitsEnv) {
  if (request.method !== "POST") {
    return json(
      { success: false, error: "仅支持 POST 请求。" },
      405,
      { Allow: "POST" },
    );
  }

  if (!isSameOriginRequest(request)) {
    return json({ success: false, error: "请求来源无效。" }, 403);
  }

  try {
    const row = await env.VISITS_DB.prepare(INCREMENT_SQL)
      .bind(COUNTER_NAME)
      .first<VisitRow>();
    const total = Number(row?.total);

    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error("Invalid visit total");
    }

    return json({ success: true, total });
  } catch {
    return json({ success: false, error: "访问次数暂时无法读取。" }, 503);
  }
}
