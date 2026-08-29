import type { CSSProperties } from "react";
import {
  SiBilibili,
  SiKuaishou,
  SiNeteasecloudmusic,
  SiTiktok,
} from "react-icons/si";
import {
  TbBackground,
  TbColorSwatch,
  TbGif,
  TbFileTypePdf,
  TbHash,
  TbMusicCog,
  TbMusicDown,
  TbPhoto,
  TbPhotoDown,
  TbPhotoEdit,
  TbPhotoCode,
  TbPhotoVideo,
  TbQrcode,
  TbScan,
  TbScribble,
  TbShieldLock,
  TbTypography,
  TbVideo,
  TbWaveSine,
  TbWorldSearch,
} from "react-icons/tb";
import { ToolCardLink } from "./components/tool-card-link";
import { HomeScrollRestorer } from "./components/home-scroll-restorer";

const tools = [
  {
    name: "抖音",
    title: "抖音视频解析",
    href: "/douyin",
    icon: SiTiktok,
  },
  {
    name: "B站",
    title: "B站视频解析",
    href: "/bilibili",
    icon: SiBilibili,
  },
  {
    name: "快手",
    title: "快手视频解析",
    href: "/kuaishou",
    icon: SiKuaishou,
  },
  {
    name: "颜色",
    title: "颜色格式转换",
    href: "/color",
    icon: TbColorSwatch,
  },
  {
    name: "视频转GIF",
    title: "视频转GIF",
    href: "/video-to-gif",
    icon: TbGif,
  },
  {
    name: "视频提取音频",
    title: "视频提取音频",
    href: "/video-to-audio",
    icon: TbWaveSine,
  },
  {
    name: "视频压缩",
    title: "视频压缩",
    href: "/video-compressor",
    icon: TbVideo,
  },
  {
    name: "音频格式",
    title: "音频格式转换",
    href: "/audio-converter",
    icon: TbMusicCog,
  },
  {
    name: "音频压缩",
    title: "音频压缩",
    href: "/audio-compressor",
    icon: TbMusicDown,
  },
  {
    name: "图片加水印",
    title: "图片加水印",
    href: "/image-watermark",
    icon: TbPhotoEdit,
  },
  {
    name: "图片格式",
    title: "图片格式转换",
    href: "/image-converter",
    icon: TbPhoto,
  },
  {
    name: "图片压缩",
    title: "图片压缩",
    href: "/image-compressor",
    icon: TbPhotoDown,
  },
  { name: "图片Base64", title: "图片与Base64互转", href: "/image-base64", icon: TbPhotoCode },
  { name: "图片合成GIF", title: "多张图片合成GIF", href: "/images-to-gif", icon: TbPhotoVideo },
  {
    name: "等宽线条",
    title: "图片等宽线条重绘",
    href: "/image-line-redraw",
    icon: TbScribble,
  },
  {
    name: "ASCII字符画",
    title: "ASCII字符画生成",
    href: "/ascii-art",
    icon: TbTypography,
  },
  {
    name: "敏感内容打码",
    title: "敏感内容打码",
    href: "/sensitive-redactor",
    icon: TbShieldLock,
  },
  {
    name: "IP地址查询",
    title: "IP地址查询",
    href: "/ip-lookup",
    icon: TbWorldSearch,
  },
  {
    name: "智能抠图",
    title: "智能抠图",
    href: "/background-remover",
    icon: TbBackground,
  },
  {
    name: "二维码",
    title: "二维码生成",
    href: "/qr-code",
    icon: TbQrcode,
  },
  {
    name: "二维码解析",
    title: "二维码解析",
    href: "/qr-reader",
    icon: TbScan,
  },
  {
    name: "文件哈希",
    title: "文件哈希计算",
    href: "/file-hash",
    icon: TbHash,
  },
  { name: "文档转换", title: "Word与PDF互转", href: "/document-converter", icon: TbFileTypePdf },
  {
    name: "网易云音乐",
    title: "网易云音乐无损解析（第三方）",
    href: "https://wyapi.toubiec.cn/",
    icon: SiNeteasecloudmusic,
    external: true,
  },
];

export default function Home() {
  return (
    <main className="home-shell">
      <HomeScrollRestorer />
      <header className="home-header">
        <h1>Eason的工具箱</h1>
        <p>有问题意见反馈请加QQ2459366392。</p>
      </header>

      <nav className="tool-grid" aria-label="工具列表">
        {tools.map((tool, index) => {
          const ToolIcon = tool.icon;

          return (
            <ToolCardLink
              external={tool.external}
              href={tool.href}
              key={tool.name}
              style={{ "--delay": `${index * 70 + 100}ms` } as CSSProperties}
            >
              <span className="tool-copy">
                <span className="tool-icon" aria-hidden="true">
                  <ToolIcon />
                </span>
                <strong>{tool.title}</strong>
              </span>
              <span className="tool-action" aria-hidden="true">
                <span className="tool-arrow">→</span>
              </span>
            </ToolCardLink>
          );
        })}
      </nav>
    </main>
  );
}
