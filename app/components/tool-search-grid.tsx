"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { FiSearch, FiX } from "react-icons/fi";
import {
  SiBilibili,
  SiKuaishou,
  SiNeteasecloudmusic,
  SiTiktok,
} from "react-icons/si";
import {
  TbBackground,
  TbColorSwatch,
  TbCrop,
  TbFileTypePdf,
  TbGif,
  TbHash,
  TbLayoutCollage,
  TbMusicCog,
  TbMusicDown,
  TbPhoto,
  TbPhotoCode,
  TbPhotoDown,
  TbPhotoEdit,
  TbPhotoVideo,
  TbQrcode,
  TbScan,
  TbScribble,
  TbShieldLock,
  TbTransform,
  TbTypography,
  TbVideo,
  TbWaveSine,
  TbWorldSearch,
} from "react-icons/tb";
import { ToolCardLink } from "./tool-card-link";

const tools = [
  { name: "抖音", title: "抖音视频解析", href: "/douyin", icon: SiTiktok, keywords: "短视频 无水印 链接 下载" },
  { name: "B站", title: "B站视频解析", href: "/bilibili", icon: SiBilibili, keywords: "哔哩哔哩 bilibili 视频 链接 下载" },
  { name: "快手", title: "快手视频解析", href: "/kuaishou", icon: SiKuaishou, keywords: "短视频 无水印 链接 下载" },
  { name: "颜色", title: "颜色格式转换", href: "/color", icon: TbColorSwatch, keywords: "色值 hex rgb hsl hsv cmyk" },
  { name: "视频转GIF", title: "视频转GIF", href: "/video-to-gif", icon: TbGif, keywords: "动图 gif 转换" },
  { name: "视频提取音频", title: "视频提取音频", href: "/video-to-audio", icon: TbWaveSine, keywords: "声音 音轨 导出" },
  { name: "视频格式", title: "视频格式转换", href: "/video-converter", icon: TbTransform, keywords: "mp4 webm mov mkv 转码" },
  { name: "视频压缩", title: "视频压缩", href: "/video-compressor", icon: TbVideo, keywords: "减小体积 画质 码率" },
  { name: "音频格式", title: "音频格式转换", href: "/audio-converter", icon: TbMusicCog, keywords: "mp3 wav m4a ogg 转码" },
  { name: "音频压缩", title: "音频压缩", href: "/audio-compressor", icon: TbMusicDown, keywords: "减小体积 码率" },
  { name: "图片加水印", title: "图片加水印", href: "/image-watermark", icon: TbPhotoEdit, keywords: "图像 照片 文字 标记" },
  { name: "图片格式", title: "图片格式转换", href: "/image-converter", icon: TbPhoto, keywords: "图像 照片 png jpg jpeg webp 批量" },
  { name: "图片压缩", title: "图片压缩", href: "/image-compressor", icon: TbPhotoDown, keywords: "图像 照片 减小体积 批量" },
  { name: "图片Base64", title: "图片与Base64互转", href: "/image-base64", icon: TbPhotoCode, keywords: "图像 编码 data url" },
  { name: "图片合成GIF", title: "多张图片合成GIF", href: "/images-to-gif", icon: TbPhotoVideo, keywords: "图像 照片 动图 帧动画" },
  { name: "图片拼接", title: "图片拼接", href: "/image-stitcher", icon: TbLayoutCollage, keywords: "图像 照片 合并 长图 横向 纵向" },
  { name: "图片裁剪", title: "图片裁剪", href: "/image-cropper", icon: TbCrop, keywords: "图像 照片 截取 尺寸 比例" },
  { name: "等宽线条", title: "图片等宽线条重绘", href: "/image-line-redraw", icon: TbScribble, keywords: "图像 轮廓 描边 线稿" },
  { name: "ASCII字符画", title: "ASCII字符画生成", href: "/ascii-art", icon: TbTypography, keywords: "文字 字符 figlet 艺术字" },
  { name: "敏感内容打码", title: "敏感内容打码", href: "/sensitive-redactor", icon: TbShieldLock, keywords: "图片 图像 模糊 马赛克 隐私 遮挡" },
  { name: "IP地址查询", title: "IP地址查询", href: "/ip-lookup", icon: TbWorldSearch, keywords: "网络 地区 位置 运营商" },
  { name: "智能抠图", title: "智能抠图", href: "/background-remover", icon: TbBackground, keywords: "图片 图像 去除背景 透明 ai" },
  { name: "二维码", title: "二维码生成", href: "/qr-code", icon: TbQrcode, keywords: "qr 链接 文字 logo 背景" },
  { name: "二维码解析", title: "二维码解析", href: "/qr-reader", icon: TbScan, keywords: "qr 识别 扫码 读取" },
  { name: "文件哈希", title: "文件哈希计算", href: "/file-hash", icon: TbHash, keywords: "md5 sha1 sha256 sha512 校验" },
  { name: "文档转换", title: "Word与PDF互转", href: "/document-converter", icon: TbFileTypePdf, keywords: "doc docx 文档 格式" },
  { name: "网易云音乐", title: "网易云音乐无损解析（第三方）", href: "https://wyapi.toubiec.cn/", icon: SiNeteasecloudmusic, keywords: "歌曲 音频 下载", external: true },
];

function normalizeSearch(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function toolMatchesSearch(tool: (typeof tools)[number], query: string) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeSearch(`${tool.name} ${tool.title} ${tool.keywords}`);
  return terms.every((term) => haystack.includes(term));
}

export function ToolSearchGrid() {
  const [query, setQuery] = useState("");
  const filteredTools = useMemo(
    () => tools.filter((tool) => toolMatchesSearch(tool, query)),
    [query],
  );
  const searching = normalizeSearch(query).length > 0;

  return (
    <section className="tool-browser" aria-label="工具搜索与列表">
      <div className="tool-search">
        <FiSearch aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索工具"
          aria-label="搜索工具"
          autoComplete="off"
          spellCheck={false}
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label="清空搜索">
            <FiX aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {filteredTools.length ? (
        <nav className={`tool-grid${searching ? " is-searching" : ""}`} aria-label="工具列表">
          {filteredTools.map((tool, index) => {
            const ToolIcon = tool.icon;
            return (
              <ToolCardLink
                external={tool.external}
                href={tool.href}
                key={tool.name}
                style={{ "--delay": `${index * 70 + 100}ms` } as CSSProperties}
              >
                <span className="tool-copy">
                  <span className="tool-icon" aria-hidden="true"><ToolIcon /></span>
                  <strong>{tool.title}</strong>
                </span>
                <span className="tool-action" aria-hidden="true"><span className="tool-arrow">→</span></span>
              </ToolCardLink>
            );
          })}
        </nav>
      ) : (
        <div className="tool-search-empty" role="status">
          <FiSearch aria-hidden="true" />
          <strong>没有找到相关工具</strong>
          <span>换个关键词试试</span>
          <button type="button" onClick={() => setQuery("")}>清空搜索</button>
        </div>
      )}
    </section>
  );
}
