"use client";

import { useEffect, useState } from "react";

type VisitResponse = {
  success?: boolean;
  total?: number;
};

let visitCountRequest: Promise<number | null> | null = null;

async function requestVisitCount() {
  try {
    const response = await fetch("/api/visits", {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as VisitResponse;
    return payload.success && Number.isSafeInteger(payload.total) && payload.total! >= 0
      ? payload.total!
      : null;
  } catch {
    return null;
  }
}

function getVisitCount() {
  visitCountRequest ??= requestVisitCount();
  return visitCountRequest;
}

export function SiteVisitCount() {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    void getVisitCount().then((value) => {
      if (active) setTotal(value);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <strong className="site-visit-count" aria-live="polite">
      {total === null ? "—" : total.toLocaleString("zh-CN")}
    </strong>
  );
}
