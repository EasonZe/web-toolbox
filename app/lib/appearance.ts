export type ThemeMode = "light" | "dark" | "system";
export type AccentName = "blue" | "purple" | "cyan" | "green" | "orange" | "pink" | "red" | "custom";
export type AccentOption = { value: AccentName; label: string; color: string; hover: string; strong: string };

// Self-contained so the compiled function can also run in <head>, without
// importing the application or waiting for React hydration.
export function createAppearance() {
  const themeStorageKey = "eason-toolbox-theme", accentStorageKey = "eason-toolbox-accent", customAccentStorageKey = "eason-toolbox-custom-accent";
  const defaultCustomAccent = "#756c9c";
  const accentOptions: AccentOption[] = [
    { value: "blue", label: "浅蓝", color: "#cfe2f1", hover: "#bad7e9", strong: "#4f7890" },
    { value: "purple", label: "紫色", color: "#DAD7ED", hover: "#c9c4e3", strong: "#756c9c" },
    { value: "cyan", label: "青色", color: "#bde8e8", hover: "#9edcdd", strong: "#397f82" },
    { value: "green", label: "绿色", color: "#cfe9c4", hover: "#b9dda9", strong: "#527f42" },
    { value: "orange", label: "橙色", color: "#f8d6ad", hover: "#f2c487", strong: "#9a672b" },
    { value: "pink", label: "粉色", color: "#f4c7df", hover: "#efadcf", strong: "#9a4e78" },
    { value: "red", label: "红色", color: "#f2c4c8", hover: "#eba7ad", strong: "#9b4f57" },
  ];
  function isThemeMode(value: string | null | undefined): value is ThemeMode { return value === "light" || value === "dark" || value === "system"; }
  function isAccentName(value: string | null | undefined): value is AccentName { return value === "custom" || accentOptions.some((option) => option.value === value); }
  function normalizeHexColor(value: string | null | undefined) { return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : defaultCustomAccent; }
  // Bare `typeof window` is folded by the SSR compiler. Keep these runtime
  // probes intact when this compiled function is serialized for the browser.
  function stored(key: string) { try { return globalThis.window?.localStorage.getItem(key) ?? null; } catch { return null; } }
  function rootElement() { return globalThis.document?.documentElement; }
  function readTheme(): ThemeMode { const value = stored(themeStorageKey); return isThemeMode(value) ? value : "light"; }
  function readAccent(): AccentName { const value = stored(accentStorageKey); return isAccentName(value) ? value : "blue"; }
  function initialTheme(): ThemeMode { const value = rootElement()?.dataset.themePreference; return isThemeMode(value) ? value : readTheme(); }
  function initialAccent(): AccentName { const value = rootElement()?.dataset.accentPreference; return isAccentName(value) ? value : readAccent(); }
  function initialCustomAccent() { return normalizeHexColor(rootElement()?.dataset.customAccent ?? stored(customAccentStorageKey)); }
  function mixHexColor(source: string, target: string, ratio: number) {
    const a = Number.parseInt(source.slice(1), 16), b = Number.parseInt(target.slice(1), 16);
    return `#${[16, 8, 0].map((shift) => Math.round(((a >> shift) & 255) * (1 - ratio) + ((b >> shift) & 255) * ratio).toString(16).padStart(2, "0")).join("")}`;
  }
  function customAccentPalette(color: string): AccentOption {
    const value = normalizeHexColor(color), rgb = [1, 3, 5].map((at) => Number.parseInt(value.slice(at, at + 2), 16));
    const luminance = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255;
    return { value: "custom", label: "自定义颜色", color: mixHexColor(value, "#ffffff", 0.62), hover: mixHexColor(value, "#ffffff", 0.42), strong: luminance > 0.62 ? mixHexColor(value, "#17242d", 0.48) : value };
  }
  function systemMediaQuery() { try { const browser = globalThis.window; return typeof browser?.matchMedia === "function" ? browser.matchMedia("(prefers-color-scheme: dark)") : null; } catch { return null; } }
  function applyTheme(root: HTMLElement, theme: ThemeMode, systemDark?: boolean) {
    const resolved = theme === "system" ? ((systemDark ?? systemMediaQuery()?.matches) ? "dark" : "light") : theme;
    root.dataset.theme = resolved; root.dataset.themePreference = theme;
    root.style.colorScheme = resolved;
  }
  function applyAccent(root: HTMLElement, accent: AccentName, customAccent: string) {
    const normalized = normalizeHexColor(customAccent), selected = accent === "custom" ? customAccentPalette(normalized) : accentOptions.find((option) => option.value === accent) ?? accentOptions[0];
    root.style.setProperty("--accent", selected.color); root.style.setProperty("--accent-hover", selected.hover); root.style.setProperty("--accent-strong", selected.strong);
    root.dataset.accentPreference = accent; root.dataset.customAccent = normalized;
  }
  function initialize() {
    const root = rootElement(); if (!root) return;
    applyTheme(root, readTheme());
    applyAccent(root, readAccent(), normalizeHexColor(stored(customAccentStorageKey)));
  }
  return { themeStorageKey, accentStorageKey, customAccentStorageKey, accentOptions, normalizeHexColor, initialTheme, initialAccent, initialCustomAccent, systemMediaQuery, applyTheme, applyAccent, initialize };
}
export const appearance = createAppearance();
