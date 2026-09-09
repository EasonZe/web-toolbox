"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronRight, FiEdit3, FiFileText, FiMic, FiSearch, FiStar, FiX } from "react-icons/fi";
import type { IconType } from "react-icons";
import { SiBilibili, SiKuaishou, SiNeteasecloudmusic, SiTiktok } from "react-icons/si";
import {
  TbBackground, TbBinary, TbBrandMinecraft, TbCalculator, TbCalendarStats,
  TbClock, TbColorPicker, TbColorSwatch, TbCrop, TbCurrency, TbDeviceDesktop,
  TbFileTypePdf, TbFunction, TbGif, TbGridDots, TbHash, TbHourglass,
  TbKeyboard, TbLayoutCollage, TbLink, TbMusicBolt, TbMusicCog, TbMusicDown,
  TbPhoto, TbPhotoCode, TbPhotoDown, TbPhotoEdit, TbPhotoVideo, TbQrcode,
  TbRadio, TbRewindBackward10, TbRotate360, TbScan, TbScribble, TbShieldLock,
  TbTransform, TbTypography, TbVideo, TbWaveSine, TbWheel, TbWorldSearch,
} from "react-icons/tb";
import {
  favoritesStorageKey,
  isToolViewMode,
  openFavoritesEvent,
  parseFavoriteHrefs,
  toolViewChangeEvent,
  toolViewStorageKey,
  type ToolViewMode,
} from "../lib/home-preferences";
import { ToolCardLink } from "./tool-card-link";

const categoryOrder = [
  "视频工具", "音频工具", "图片与设计", "文字与文档", "编码与开发",
  "计算与换算", "时间与生活", "设备与网络", "其他服务",
] as const;

type ToolCategory = (typeof categoryOrder)[number];
type Tool = {
  name: string; title: string; href: string; icon: IconType; keywords: string;
  category: ToolCategory; external?: boolean;
};

const tools: Tool[] = [
  { name: "抖音", title: "抖音视频解析", href: "/douyin", icon: SiTiktok, keywords: "短视频 无水印 链接 下载", category: "视频工具" },
  { name: "B站", title: "B站视频解析", href: "/bilibili", icon: SiBilibili, keywords: "哔哩哔哩 bilibili 视频 链接 下载", category: "视频工具" },
  { name: "快手", title: "快手视频解析", href: "/kuaishou", icon: SiKuaishou, keywords: "短视频 无水印 链接 下载", category: "视频工具" },
  { name: "颜色", title: "颜色格式转换", href: "/color", icon: TbColorSwatch, keywords: "色值 hex rgb hsl hsv cmyk", category: "图片与设计" },
  { name: "视频转GIF", title: "视频转GIF", href: "/video-to-gif", icon: TbGif, keywords: "动图 gif 转换", category: "视频工具" },
  { name: "视频提取音频", title: "视频提取音频", href: "/video-to-audio", icon: TbWaveSine, keywords: "声音 音轨 导出", category: "视频工具" },
  { name: "视频格式", title: "视频格式转换", href: "/video-converter", icon: TbTransform, keywords: "mp4 webm mov mkv 转码", category: "视频工具" },
  { name: "视频压缩", title: "视频压缩", href: "/video-compressor", icon: TbVideo, keywords: "减小体积 画质 码率", category: "视频工具" },
  { name: "视频倒放", title: "视频倒放", href: "/video-reverser", icon: TbRewindBackward10, keywords: "反向 逆向 倒序 webm", category: "视频工具" },
  { name: "视频水印", title: "视频加水印", href: "/video-watermark", icon: TbPhotoEdit, keywords: "文字 图片 logo 标记 透明度", category: "视频工具" },
  { name: "音频格式", title: "音频格式转换", href: "/audio-converter", icon: TbMusicCog, keywords: "mp3 wav m4a ogg 转码", category: "音频工具" },
  { name: "音频压缩", title: "音频压缩", href: "/audio-compressor", icon: TbMusicDown, keywords: "减小体积 码率", category: "音频工具" },
  { name: "音频倒放", title: "音频倒放", href: "/audio-reverser", icon: TbRewindBackward10, keywords: "声音 反向 逆向 倒序 wav", category: "音频工具" },
  { name: "音频变速变调", title: "音频变速与变调", href: "/audio-speed-pitch", icon: TbMusicBolt, keywords: "声音 速度 音高 升调 降调 半音 soundtouch wav", category: "音频工具" },
  { name: "3D模型", title: "3D模型预览与转台动画", href: "/model-turntable", icon: TbRotate360, keywords: "三维 模型 glb gltf obj stl fbx 预览 360 旋转 转台 视频 webm", category: "图片与设计" },
  { name: "麦克风", title: "麦克风测试与录音", href: "/microphone-recorder", icon: FiMic, keywords: "话筒 声音 音量 波形 录制 试听", category: "音频工具" },
  { name: "图片加水印", title: "图片加水印", href: "/image-watermark", icon: TbPhotoEdit, keywords: "图像 照片 文字 标记", category: "图片与设计" },
  { name: "图片文字", title: "图片加文字与对话框", href: "/image-text", icon: FiEdit3, keywords: "图像 照片 文本 字体 气泡 字幕 对话框", category: "图片与设计" },
  { name: "拼豆图纸", title: "拼豆图纸生成", href: "/bead-pattern", icon: TbGridDots, keywords: "图片 像素 拼拼豆 豆豆 图纸 网格 色号 用量", category: "图片与设计" },
  { name: "像素画", title: "图片转像素画", href: "/pixel-art", icon: TbBrandMinecraft, keywords: "图片 像素 pixel art 马赛克 量化 抖动", category: "图片与设计" },
  { name: "图片配色", title: "图片取色与配色提取", href: "/image-palette", icon: TbColorPicker, keywords: "图片 颜色 主色 调色板 色卡 hex rgb hsl 取色器", category: "图片与设计" },
  { name: "图片格式", title: "图片格式转换", href: "/image-converter", icon: TbPhoto, keywords: "图像 照片 png jpg jpeg webp 批量", category: "图片与设计" },
  { name: "图片压缩", title: "图片压缩", href: "/image-compressor", icon: TbPhotoDown, keywords: "图像 照片 减小体积 批量", category: "图片与设计" },
  { name: "图片Base64", title: "图片与Base64互转", href: "/image-base64", icon: TbPhotoCode, keywords: "图像 编码 data url", category: "编码与开发" },
  { name: "图片合成GIF", title: "多张图片合成GIF", href: "/images-to-gif", icon: TbPhotoVideo, keywords: "图像 照片 动图 帧动画", category: "图片与设计" },
  { name: "图片拼接", title: "图片拼接", href: "/image-stitcher", icon: TbLayoutCollage, keywords: "图像 照片 合并 长图 横向 纵向", category: "图片与设计" },
  { name: "图片裁剪", title: "图片裁剪", href: "/image-cropper", icon: TbCrop, keywords: "图像 照片 截取 尺寸 比例", category: "图片与设计" },
  { name: "等宽线条", title: "图片等宽线条重绘", href: "/image-line-redraw", icon: TbScribble, keywords: "图像 轮廓 描边 线稿", category: "图片与设计" },
  { name: "ASCII字符画", title: "ASCII字符画生成", href: "/ascii-art", icon: TbTypography, keywords: "文字 字符 figlet 艺术字", category: "文字与文档" },
  { name: "花体字", title: "花体字转换器", href: "/fancy-text", icon: TbTypography, keywords: "文字 字体 unicode 双线体 艺术字 英文", category: "文字与文档" },
  { name: "字数统计", title: "字数统计", href: "/word-counter", icon: FiFileText, keywords: "文字 字符 词数 段落 行数 阅读时长", category: "文字与文档" },
  { name: "抽签大转盘", title: "抽签大转盘", href: "/lottery-wheel", icon: TbWheel, keywords: "抽奖 名单 导入 随机 选择 csv excel", category: "时间与生活" },
  { name: "短链接", title: "短链接生成", href: "/short-link", icon: TbLink, keywords: "网址 缩短 链接 分享 url", category: "设备与网络" },
  { name: "计算器", title: "计算器", href: "/calculator", icon: TbCalculator, keywords: "数学 科学 运算 加减乘除 百分比", category: "计算与换算" },
  { name: "进制转换", title: "进制转换器", href: "/base-converter", icon: TbBinary, keywords: "二进制 八进制 十进制 十六进制 radix bigint", category: "编码与开发" },
  { name: "函数图像", title: "函数图像绘制", href: "/function-plotter", icon: TbFunction, keywords: "数学 曲线 坐标 绘图 函数 plot graph", category: "计算与换算" },
  { name: "摩斯电码", title: "摩斯电码转换", href: "/morse-code", icon: TbRadio, keywords: "莫尔斯 电报码 点划 编码 解码 播放", category: "编码与开发" },
  { name: "屏幕测试", title: "屏幕纯色测试", href: "/screen-test", icon: TbDeviceDesktop, keywords: "显示器 坏点 亮点 漏光 纯色 全屏", category: "设备与网络" },
  { name: "键盘测试", title: "键盘按键测试", href: "/keyboard-test", icon: TbKeyboard, keywords: "按键 键位 keyboard NKRO 多键 同时", category: "设备与网络" },
  { name: "日期计算", title: "日期计算器", href: "/date-calculator", icon: TbCalendarStats, keywords: "日期 天数 间隔 工作日 加减 推算 周 月 年", category: "时间与生活" },
  { name: "倒计时", title: "倒计时器", href: "/countdown", icon: TbHourglass, keywords: "计时 定时 目标时间 番茄钟 全屏 提示音", category: "时间与生活" },
  { name: "汇率转换", title: "实时汇率转换", href: "/currency-converter", icon: TbCurrency, keywords: "外汇 货币 人民币 美元 欧元 日元 换算", category: "计算与换算" },
  { name: "全球时间", title: "全球实时时间", href: "/world-clock", icon: TbClock, keywords: "世界时钟 时区 IANA 北京 纽约 伦敦 东京 全屏 秒", category: "时间与生活" },
  { name: "敏感内容打码", title: "敏感内容打码", href: "/sensitive-redactor", icon: TbShieldLock, keywords: "图片 图像 模糊 马赛克 隐私 遮挡", category: "图片与设计" },
  { name: "IP地址查询", title: "IP地址查询", href: "/ip-lookup", icon: TbWorldSearch, keywords: "网络 地区 位置 运营商", category: "设备与网络" },
  { name: "智能抠图", title: "智能抠图", href: "/background-remover", icon: TbBackground, keywords: "图片 图像 去除背景 透明 ai", category: "图片与设计" },
  { name: "二维码", title: "二维码生成", href: "/qr-code", icon: TbQrcode, keywords: "qr 链接 文字 logo 背景", category: "编码与开发" },
  { name: "二维码解析", title: "二维码解析", href: "/qr-reader", icon: TbScan, keywords: "qr 识别 扫码 读取", category: "编码与开发" },
  { name: "文件哈希", title: "文件哈希计算", href: "/file-hash", icon: TbHash, keywords: "md5 sha1 sha256 sha512 校验", category: "编码与开发" },
  { name: "文档转换", title: "Word与PDF互转", href: "/document-converter", icon: TbFileTypePdf, keywords: "doc docx 文档 格式", category: "文字与文档" },
  { name: "网易云音乐", title: "网易云音乐无损解析（第三方）", href: "https://wyapi.toubiec.cn/", icon: SiNeteasecloudmusic, keywords: "歌曲 音频 下载", category: "其他服务", external: true },
];

function normalizeSearch(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function toolMatchesSearch(tool: Tool, query: string) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeSearch(`${tool.name} ${tool.title} ${tool.keywords} ${tool.category}`);
  return terms.every((term) => haystack.includes(term));
}

function readViewPreference(): ToolViewMode {
  if (typeof window === "undefined") return "cards";
  try {
    const value = window.localStorage.getItem(toolViewStorageKey);
    return isToolViewMode(value) ? value : "cards";
  } catch { return "cards"; }
}

function readFavorites() {
  if (typeof window === "undefined") return new Set<string>();
  try { return parseFavoriteHrefs(window.localStorage.getItem(favoritesStorageKey)); }
  catch { return new Set<string>(); }
}

export function ToolSearchGrid() {
  const browserRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ToolViewMode>("cards");
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"全部" | ToolCategory>("全部");
  const [expandedCategories, setExpandedCategories] = useState<Set<ToolCategory>>(() => new Set([categoryOrder[0]]));
  const filteredTools = useMemo(
    () => tools.filter((tool) => toolMatchesSearch(tool, query)),
    [query],
  );
  const categoryTools = useMemo(
    () => activeCategory === "全部" ? filteredTools : filteredTools.filter((tool) => tool.category === activeCategory),
    [activeCategory, filteredTools],
  );
  const visibleTools = useMemo(
    () => favoritesOnly ? categoryTools.filter((tool) => favorites.has(tool.href)) : categoryTools,
    [categoryTools, favorites, favoritesOnly],
  );
  const searching = normalizeSearch(query).length > 0;

  useEffect(() => {
    const restoreFrame = window.requestAnimationFrame(() => {
      setView(readViewPreference());
      setFavorites(readFavorites());
    });
    const handleViewChange = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (isToolViewMode(value)) setView(value);
    };
    const scrollToBrowser = () => {
      window.requestAnimationFrame(() => browserRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    const showFavorites = () => {
      setFavoritesOnly(true);
      scrollToBrowser();
    };
    const toggleFavorites = () => {
      setFavoritesOnly((current) => {
        const next = !current;
        if (next) scrollToBrowser();
        return next;
      });
    };
    const handleHash = () => {
      if (window.location.hash === "#favorites") showFavorites();
    };
    window.addEventListener(toolViewChangeEvent, handleViewChange);
    window.addEventListener(openFavoritesEvent, toggleFavorites);
    window.addEventListener("hashchange", handleHash);
    handleHash();
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      window.removeEventListener(toolViewChangeEvent, handleViewChange);
      window.removeEventListener(openFavoritesEvent, toggleFavorites);
      window.removeEventListener("hashchange", handleHash);
    };
  }, []);

  useEffect(() => {
    const browser = browserRef.current;
    if (!browser) return;

    let observer: IntersectionObserver | undefined;
    const frame = window.requestAnimationFrame(() => {
      const selector = view === "groups"
        ? ".tool-category-collapsible"
        : ".tool-category-heading, .tool-card-shell";
      const items = Array.from(browser.querySelectorAll<HTMLElement>(selector));
      items.forEach((item, index) => {
        item.classList.remove("is-revealed");
        item.classList.add("is-reveal-pending");
        item.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 45}ms`);
      });

      if (!("IntersectionObserver" in window)) {
        items.forEach((item) => item.classList.add("is-revealed"));
        return;
      }

      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const item = entry.target as HTMLElement;
          item.classList.add("is-revealed");
          observer?.unobserve(item);
        });
      }, { rootMargin: "0px 0px -7% 0px", threshold: 0.08 });
      items.forEach((item) => observer?.observe(item));
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [activeCategory, favoritesOnly, searching, view, visibleTools.length]);

  function toggleFavorite(href: string) {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(href)) next.delete(href); else next.add(href);
      try { window.localStorage.setItem(favoritesStorageKey, JSON.stringify([...next])); } catch { /* Favorites still work for the current session. */ }
      return next;
    });
  }

  function renderTool(tool: Tool, index: number) {
    const ToolIcon = tool.icon;
    const favorite = favorites.has(tool.href);
    return (
      <div className={`tool-card-shell${favorite ? " is-favorite" : ""}`} key={tool.href}>
        <ToolCardLink external={tool.external} href={tool.href} style={{ "--delay": `${index * 35 + 80}ms` } as CSSProperties}>
          <span className="tool-copy">
            <span className="tool-icon" aria-hidden="true"><ToolIcon /></span>
            <strong>{tool.title}</strong>
          </span>
          <span className="tool-card-category">{tool.category}</span>
          <span className="tool-action" aria-hidden="true"><span className="tool-arrow">→</span><FiChevronRight className="tool-table-chevron" /></span>
        </ToolCardLink>
        <button className="tool-favorite-button" type="button" onClick={() => toggleFavorite(tool.href)} aria-label={favorite ? `取消收藏${tool.title}` : `收藏${tool.title}`} aria-pressed={favorite} title={favorite ? "取消收藏" : "加入收藏夹"}>
          <FiStar aria-hidden="true" />
        </button>
      </div>
    );
  }

  const groupedTools = categoryOrder
    .map((category) => ({ category, tools: visibleTools.filter((tool) => tool.category === category) }))
    .filter((group) => group.tools.length > 0);
  const orderedVisibleTools = groupedTools.flatMap((group) => group.tools);

  function setCategoryExpanded(category: ToolCategory, expanded: boolean) {
    setExpandedCategories((current) => {
      if (current.has(category) === expanded) return current;
      const next = new Set(current);
      if (expanded) next.add(category); else next.delete(category);
      return next;
    });
  }

  return (
    <section className="tool-browser" id="favorites" aria-label="工具搜索与列表" ref={browserRef}>
      <div className="tool-browser-toolbar">
        <div className="tool-search">
          <FiSearch aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工具" aria-label="搜索工具" autoComplete="off" spellCheck={false} />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="清空搜索"><FiX aria-hidden="true" /></button> : null}
        </div>
        <button className={`favorites-filter${favoritesOnly ? " is-active" : ""}`} type="button" onClick={() => setFavoritesOnly((value) => !value)} aria-pressed={favoritesOnly}>
          <FiStar aria-hidden="true" />{favoritesOnly ? "查看全部" : "收藏夹"}
        </button>
      </div>

      <nav className="tool-category-tabs" aria-label="工具分类">
        <button className={activeCategory === "全部" ? "is-active" : ""} type="button" onClick={() => setActiveCategory("全部")} aria-pressed={activeCategory === "全部"}>全部</button>
        {categoryOrder.map((category) => (
          <button className={activeCategory === category ? "is-active" : ""} type="button" key={category} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category}>{category}</button>
        ))}
      </nav>

      {favoritesOnly ? (
        <div className="favorites-heading">
          <div><FiStar aria-hidden="true" /><span><strong>收藏夹</strong><span className="favorites-subtitle">常用工具集中在这里</span></span></div>
          <button type="button" onClick={() => setFavoritesOnly(false)}>返回全部工具</button>
        </div>
      ) : null}

      {visibleTools.length ? (
        <div className={`tool-list-view is-${view}${searching ? " is-searching" : ""}`} data-view={view}>
          {view === "table" ? (
            <>
              <div className="tool-table-head" aria-hidden="true"><span>工具</span><span>分类</span><span>操作</span></div>
              <nav className={`tool-grid${searching ? " is-searching" : ""}`} aria-label="工具列表">{orderedVisibleTools.map((tool, index) => renderTool(tool, index))}</nav>
            </>
          ) : groupedTools.map((group, categoryIndex) => view === "groups" ? (
            <details
              className="tool-category tool-category-collapsible"
              key={group.category}
              open={searching || expandedCategories.has(group.category)}
              onToggle={(event) => { if (!searching) setCategoryExpanded(group.category, event.currentTarget.open); }}
            >
              <summary><span>{group.category}</span><span className="tool-category-count">{group.tools.length} 项</span></summary>
              <nav className={`tool-grid${searching ? " is-searching" : ""}`} aria-label={`${group.category}工具`}>{group.tools.map((tool, index) => renderTool(tool, index))}</nav>
            </details>
          ) : (
            <section className="tool-category" key={group.category} aria-labelledby={`category-${categoryIndex}`}>
              <div className="tool-category-heading"><h2 id={`category-${categoryIndex}`}>{group.category}</h2><span>{group.tools.length} 项</span></div>
              <nav className={`tool-grid${searching ? " is-searching" : ""}`} aria-label={`${group.category}工具`}>{group.tools.map((tool, index) => renderTool(tool, index))}</nav>
            </section>
          ))}
        </div>
      ) : (
        <div className="tool-search-empty" role="status">
          {favoritesOnly ? <FiStar aria-hidden="true" /> : <FiSearch aria-hidden="true" />}
          <strong>{favoritesOnly ? "收藏夹还是空的" : "没有找到相关工具"}</strong>
          <span>{favoritesOnly ? "点击工具卡片右上角的星标即可收藏" : "换个关键词试试"}</span>
          <button type="button" onClick={() => favoritesOnly ? setFavoritesOnly(false) : setQuery("")}>{favoritesOnly ? "浏览全部工具" : "清空搜索"}</button>
        </div>
      )}
    </section>
  );
}
