"use client";

import type { CSSProperties, ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  FiArrowLeft,
  FiArrowUp,
  FiCheck,
  FiHeart,
  FiGrid,
  FiLayers,
  FiList,
  FiMenu,
  FiMonitor,
  FiMoon,
  FiSettings,
  FiStar,
  FiSun,
} from "react-icons/fi";
import {
  isToolViewMode,
  openFavoritesEvent,
  toolViewChangeEvent,
  toolViewStorageKey,
  type ToolViewMode,
} from "../lib/home-preferences";

type ThemeMode = "light" | "dark" | "system";
type AccentName =
  | "blue"
  | "purple"
  | "cyan"
  | "green"
  | "orange"
  | "pink"
  | "red"
  | "coral";

type ThemeOption = {
  value: ThemeMode;
  label: string;
  icon: ComponentType;
};

type AccentOption = {
  value: AccentName;
  label: string;
  color: string;
  hover: string;
  strong: string;
};

type ToolViewOption = {
  value: ToolViewMode;
  label: string;
  description: string;
  icon: ComponentType;
};

const themeOptions: ThemeOption[] = [
  { value: "light", label: "浅色", icon: FiSun },
  { value: "dark", label: "深色", icon: FiMoon },
  { value: "system", label: "系统", icon: FiMonitor },
];

const accentOptions: AccentOption[] = [
  {
    value: "blue",
    label: "浅蓝",
    color: "#cfe2f1",
    hover: "#bad7e9",
    strong: "#4f7890",
  },
  {
    value: "purple",
    label: "紫色",
    color: "#DAD7ED",
    hover: "#c9c4e3",
    strong: "#756c9c",
  },
  {
    value: "cyan",
    label: "青色",
    color: "#bde8e8",
    hover: "#9edcdd",
    strong: "#397f82",
  },
  {
    value: "green",
    label: "绿色",
    color: "#cfe9c4",
    hover: "#b9dda9",
    strong: "#527f42",
  },
  {
    value: "orange",
    label: "橙色",
    color: "#f8d6ad",
    hover: "#f2c487",
    strong: "#9a672b",
  },
  {
    value: "pink",
    label: "粉色",
    color: "#f4c7df",
    hover: "#efadcf",
    strong: "#9a4e78",
  },
  {
    value: "red",
    label: "红色",
    color: "#f2c4c8",
    hover: "#eba7ad",
    strong: "#9b4f57",
  },
  {
    value: "coral",
    label: "珊瑚",
    color: "#f6cdbd",
    hover: "#efb29b",
    strong: "#9c5a43",
  },
];

const toolViewOptions: ToolViewOption[] = [
  { value: "groups", label: "折叠分组", description: "按分类展开或收起", icon: FiLayers },
  { value: "table", label: "紧凑表格", description: "一屏浏览更多工具", icon: FiList },
  { value: "minimal", label: "极简分割线", description: "只保留必要信息", icon: FiMenu },
  { value: "cards", label: "卡片网格", description: "当前的大卡片布局", icon: FiGrid },
];

const themeStorageKey = "eason-toolbox-theme";
const accentStorageKey = "eason-toolbox-accent";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function isAccentName(value: string | null): value is AccentName {
  return accentOptions.some((option) => option.value === value);
}

export default function FloatingDock() {
  const pathname = usePathname();
  const isToolPage = pathname !== "/";
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    try {
      const savedTheme = window.localStorage.getItem(themeStorageKey);
      return isThemeMode(savedTheme) ? savedTheme : "light";
    } catch { return "light"; }
  });
  const [accent, setAccent] = useState<AccentName>(() => {
    if (typeof window === "undefined") return "blue";
    try {
      const savedAccent = window.localStorage.getItem(accentStorageKey);
      return isAccentName(savedAccent) ? savedAccent : "blue";
    } catch { return "blue"; }
  });
  const [toolView, setToolView] = useState<ToolViewMode>(() => {
    if (typeof window === "undefined") return "cards";
    try {
      const savedView = window.localStorage.getItem(toolViewStorageKey);
      return isToolViewMode(savedView) ? savedView : "cards";
    } catch { return "cards"; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const settingsDialogRef = useRef<HTMLElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolvedTheme =
        theme === "system" ? (mediaQuery.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.dataset.themePreference = theme;
    };

    applyTheme();
    try { window.localStorage.setItem(themeStorageKey, theme); } catch { /* Private browsing can disable storage. */ }

    if (theme === "system") {
      mediaQuery.addEventListener("change", applyTheme);
      return () => mediaQuery.removeEventListener("change", applyTheme);
    }
  }, [theme]);

  useEffect(() => {
    const selectedAccent =
      accentOptions.find((option) => option.value === accent) ??
      accentOptions[0];
    const root = document.documentElement;

    root.style.setProperty("--accent", selectedAccent.color);
    root.style.setProperty("--accent-hover", selectedAccent.hover);
    root.style.setProperty("--accent-strong", selectedAccent.strong);
    try { window.localStorage.setItem(accentStorageKey, accent); } catch { /* Keep the selected color usable without storage. */ }
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.toolView = toolView;
    try { window.localStorage.setItem(toolViewStorageKey, toolView); } catch { /* Keep the view usable without storage. */ }
    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(new window.CustomEvent(toolViewChangeEvent, { detail: toolView }));
    }
  }, [toolView]);

  useEffect(() => {
    const updateScrollButton = () => setShowScrollTop(window.scrollY > 32);
    updateScrollButton();
    window.addEventListener("scroll", updateScrollButton, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollButton);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = settingsDialogRef.current;
    const initialFocus = dialog?.querySelector<HTMLElement>(
      "[data-dialog-initial-focus]",
    );
    initialFocus?.focus();

    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDialogKeys);
      dialogTriggerRef.current?.focus();
    };
  }, [settingsOpen]);

  function openSettings() {
    dialogTriggerRef.current = document.activeElement as HTMLElement;
    setSettingsOpen(true);
  }

  function openFavorites() {
    if (pathname !== "/") {
      window.location.assign("/#favorites");
      return;
    }
    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(new window.CustomEvent(openFavoritesEvent));
    }
  }

  return (
    <>
      <aside
        className={`floating-dock${isToolPage ? " is-tool-page" : ""}`}
        aria-label="页面快捷操作"
        aria-hidden={settingsOpen || undefined}
      >
        <a
          className="dock-button"
          href="https://ifdian.net/a/easonzhan"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="爱发电支持作者"
          title="爱发电"
        >
          <FiHeart aria-hidden="true" />
        </a>
        <button
          className="dock-button"
          type="button"
          onClick={openFavorites}
          aria-label="打开收藏夹"
          title="收藏夹"
        >
          <FiStar aria-hidden="true" />
        </button>
        <button
          className={`dock-button${settingsOpen ? " is-active" : ""}`}
          type="button"
          onClick={openSettings}
          aria-label="打开设置"
          title="设置"
        >
          <FiSettings aria-hidden="true" />
        </button>
        {showScrollTop ? (
          <button
            className="dock-button dock-top-button"
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="回到顶部"
            title="回到顶部"
          >
            <FiArrowUp aria-hidden="true" />
          </button>
        ) : null}
      </aside>

      {settingsOpen ? (
        <section
          className="settings-view"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          ref={settingsDialogRef}
        >
          <header className="settings-header">
            <div className="settings-title-row">
              <button
                className="settings-back-button"
                type="button"
                onClick={() => setSettingsOpen(false)}
                data-dialog-initial-focus
              >
                <FiArrowLeft aria-hidden="true" />
                返回主页面
              </button>
              <h2 id="settings-title">设置</h2>
            </div>
            <p>在这里调整你的偏好与各项配置</p>
          </header>

          <div className="settings-card">
            <h3 className="settings-section-title">
              <FiSun aria-hidden="true" />
              外观模式
            </h3>

            <div className="theme-mode-grid">
              {themeOptions.map((option) => {
                const ThemeIcon = option.icon;
                const selected = theme === option.value;

                return (
                  <button
                    className={`theme-mode-button${selected ? " is-selected" : ""}`}
                    type="button"
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    aria-pressed={selected}
                  >
                    <ThemeIcon aria-hidden="true" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="settings-divider" />

            <div className="tool-view-settings">
              <div>
                <h3>工具列表</h3>
                <p>选择首页工具的排列方式，偏好会自动保存在当前浏览器。</p>
              </div>
              <div className="tool-view-grid" aria-label="工具列表排列方式">
                {toolViewOptions.map((option) => {
                  const ViewIcon = option.icon;
                  const selected = toolView === option.value;
                  return (
                    <button
                      className={`tool-view-button${selected ? " is-selected" : ""}`}
                      type="button"
                      key={option.value}
                      onClick={() => setToolView(option.value)}
                      aria-pressed={selected}
                    >
                      <ViewIcon aria-hidden="true" />
                      <span><strong>{option.label}</strong><small>{option.description}</small></span>
                      {selected ? <FiCheck aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="settings-divider" />

            <div className="accent-settings">
              <div>
                <h3>主题颜色</h3>
                <p>选择应用的主题强调色，按钮、链接和动画将会同步变化。</p>
              </div>
              <div className="accent-options" aria-label="主题颜色">
                {accentOptions.map((option) => {
                  const selected = accent === option.value;

                  return (
                    <button
                      className={`accent-button${selected ? " is-selected" : ""}`}
                      type="button"
                      key={option.value}
                      onClick={() => setAccent(option.value)}
                      aria-label={option.label}
                      aria-pressed={selected}
                      title={option.label}
                      style={
                        {
                          "--swatch-color": option.color,
                          "--swatch-strong": option.strong,
                        } as CSSProperties
                      }
                    >
                      {selected ? <FiCheck aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
