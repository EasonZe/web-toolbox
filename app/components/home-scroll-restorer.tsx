"use client";

import { useEffect } from "react";

const HOME_SCROLL_KEY = "eason-toolbox-home-scroll";
const MAX_SAVED_AGE = 30 * 60 * 1000;

export function HomeScrollRestorer() {
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(HOME_SCROLL_KEY);
      window.sessionStorage.removeItem(HOME_SCROLL_KEY);
    } catch {
      return;
    }
    if (!stored) return;

    let top = NaN;
    let savedAt = 0;
    try {
      const value = JSON.parse(stored) as { top?: unknown; savedAt?: unknown };
      top = typeof value.top === "number" ? value.top : NaN;
      savedAt = typeof value.savedAt === "number" ? value.savedAt : 0;
    } catch {
      return;
    }
    if (!Number.isFinite(top) || top < 0 || Date.now() - savedAt > MAX_SAVED_AGE) return;

    let frame = 0;
    const restore = () => window.scrollTo({ top, behavior: "auto" });
    frame = window.requestAnimationFrame(() => {
      restore();
      frame = window.requestAnimationFrame(restore);
    });
    const timer = window.setTimeout(restore, 120);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
