"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronRight, FiEdit3, FiFileText, FiMic, FiSearch, FiStar, FiX } from "react-icons/fi";
import type { IconType } from "react-icons";
import { SiBilibili, SiTiktok } from "react-icons/si";
import {
  TbBackground, TbBarcode, TbBinary, TbBrandMinecraft, TbCalendarStats, TbChartDots,
  TbClock, TbColorPicker, TbColorSwatch, TbCrop, TbCurrency, TbDeviceDesktop,
  TbFileTypePdf, TbFunction, TbGif, TbGridDots, TbHash, TbHourglass,
  TbKeyboard, TbKey, TbLayoutCollage, TbLink, TbMathFunction, TbMatrix, TbMetronome, TbMusicBolt, TbMusicCog, TbMusicDown, TbNumbers,
  TbPhoto, TbPhotoCode, TbPhotoDown, TbPhotoEdit, TbPhotoVideo, TbQrcode, TbPackage,
  TbRadio, TbRegex, TbRewindBackward10, TbRotate360, TbScan, TbScribble, TbShieldLock,
  TbTextGrammar, TbNotes, TbTransform, TbTypography, TbVariable, TbVideo, TbWaveSine, TbWheel, TbWorldSearch,
} from "react-icons/tb";
import {
  favoritesStorageKey,
  isToolViewMode,
  openFavoritesEvent,
  parseFavoriteHrefs,
  replayToolAnimationEvent,
  toolViewChangeEvent,
  toolViewStorageKey,
  type ToolViewMode,
} from "../lib/home-preferences";
import { ToolCardLink } from "./tool-card-link";

const categoryOrder = [
  "视频工具", "音频工具", "图片与设计", "文字与文档", "编码与开发",
  "计算与换算", "时间与生活", "设备与网络",
] as const;
const primaryMobileCategories = categoryOrder.slice(0, 3);
const secondaryMobileCategories = categoryOrder.slice(3);

type ToolCategory = (typeof categoryOrder)[number];
type Tool = {
  name: string; title: string; href: string; icon: IconType; keywords: string;
  category: ToolCategory; external?: boolean;
};

const tools: Tool[] = [
  { name: "PDF页码", title: "PDF 加页码", href: "/pdf-page-numbers", icon: TbFileTypePdf, keywords: "文档 页数 编号 中文 模板 页眉 页脚", category: "文字与文档" },
  { name: "PDF裁剪", title: "PDF 页面裁剪", href: "/pdf-cropper", icon: TbCrop, keywords: "文档 页面 裁切 白边 边距 cropbox 旋转", category: "文字与文档" },
  { name: "图片换色", title: "图片指定颜色替换", href: "/image-color-replace", icon: TbColorPicker, keywords: "图像 颜色 替换 取色 容差 透明 png", category: "图片与设计" },
  { name: "提词器", title: "提词器", href: "/teleprompter", icon: TbNotes, keywords: "文字 稿件 朗读 滚动 镜像 全屏 演讲", category: "文字与文档" },
  { name: "PPTX提取", title: "PPTX 图片与文字提取", href: "/pptx-extractor", icon: FiFileText, keywords: "ppt pptx powerpoint 幻灯片 演示文稿 素材 图片 文本 zip", category: "文字与文档" },
  { name: "打字测试", title: "打字速度测试", href: "/typing-test", icon: TbKeyboard, keywords: "输入 练习 中英文 wpm cpm 准确率 速度 键盘", category: "时间与生活" },
  { name: "IP子网", title: "IP / CIDR 子网计算", href: "/cidr-calculator", icon: TbWorldSearch, keywords: "网络 ipv4 ipv6 cidr 子网 掩码 广播 主机 地址范围", category: "设备与网络" },
  { name: "URL解析", title: "URL 解析与参数编辑", href: "/url-parser", icon: TbLink, keywords: "网址 链接 url uri query 查询 参数 域名 片段 utm", category: "编码与开发" },
  { name: "渐变色", title: "渐变色生成器", href: "/gradient-generator", icon: TbColorSwatch, keywords: "颜色 gradient 渐变 css svg png 色标 oklab 透明度", category: "图片与设计" },
  { name: "CSS阴影", title: "CSS 阴影生成器", href: "/shadow-generator", icon: TbPhotoEdit, keywords: "样式 box shadow css 阴影 内阴影 外阴影 模糊 多层", category: "图片与设计" },
  { name: "Cron预览", title: "Cron 表达式预览", href: "/cron-preview", icon: TbClock, keywords: "cron crontab 表达式 定时 调度 时区 秒 下次 执行时间", category: "编码与开发" },
  { name: "文件类型", title: "文件真实类型识别", href: "/file-identification", icon: TbNotes, keywords: "文件 格式 魔数 签名 二进制 文件头 扩展名 mime hex", category: "编码与开发" },
  { name: "图片差异", title: "图片差异对比", href: "/image-difference", icon: TbPhotoEdit, keywords: "图像 图片 diff 像素 差异 对照 比较 遮罩 修改 检查 pixelmatch", category: "图片与设计" },
  { name: "视频裁剪", title: "视频裁剪", href: "/video-trimmer", icon: TbCrop, keywords: "视频 剪辑 截取 时间 区间 trim clip mp4 webm", category: "视频工具" },
  { name: "PDF导出", title: "PDF 转图片与文字", href: "/pdf-export", icon: TbFileTypePdf, keywords: "pdf 文档 转图片 png jpg jpeg 提取文字 文本 页码 批量 zip", category: "文字与文档" },
  { name: "图片网格", title: "图片九宫格与网格切分", href: "/image-grid", icon: TbGridDots, keywords: "图片 九宫格 切图 分割 网格 分块 朋友圈 拼图 裁剪 zip", category: "图片与设计" },
  { name: "YAML", title: "YAML / JSON 互转", href: "/yaml-converter", icon: TbPhotoCode, keywords: "yaml yml json 配置 转换 格式 语法 校验 缩进", category: "编码与开发" },
  { name: "颜色对比度", title: "颜色对比度检查", href: "/color-contrast", icon: TbColorSwatch, keywords: "颜色 文字 背景 对比度 wcag aa aaa 无障碍 contrast css", category: "图片与设计" },
  { name: "文本编码", title: "文本编码与解码", href: "/text-codec", icon: TbPhotoCode, keywords: "base64 base64url URL 表单 HTML 实体 Unicode 转义 编码 解码 UTF8", category: "编码与开发" },
  { name: "汉字拼音", title: "汉字转拼音", href: "/text-pinyin", icon: TbTextGrammar, keywords: "文字 中文 汉语 声调 数字声调 首字母 姓氏 pinyin", category: "文字与文档" },
  { name: "表格转换", title: "CSV / JSON 表格转换", href: "/table-converter", icon: TbNotes, keywords: "csv tsv json 表格 数据 格式 转换 分隔符", category: "文字与文档" },
  { name: "图片转PDF", title: "图片转 PDF", href: "/images-to-pdf", icon: TbFileTypePdf, keywords: "图片 文档 合并 照片 批量 png jpg webp pdf 纸张 页序", category: "文字与文档" },
  { name: "单位换算", title: "单位换算", href: "/unit-converter", icon: TbTransform, keywords: "长度 面积 体积 质量 温度 速度 压力 能量 功率 时间 数据容量 单位 cm inch kg psi celsius unit", category: "计算与换算" },
  { name: "图片调色", title: "图片调色与滤镜", href: "/image-adjuster", icon: TbPhotoEdit, keywords: "图像 亮度 对比度 饱和度 冷暖 黑白 反色 filter", category: "图片与设计" },
  { name: "图片DPI", title: "图片 DPI 修改", href: "/image-dpi", icon: TbPhotoCode, keywords: "图像 分辨率 密度 打印 dpi ppi 300 png jpg 元数据", category: "图片与设计" },
  { name: "视频截图", title: "视频截图与取帧", href: "/video-capture", icon: TbPhotoVideo, keywords: "视频 画面 截图 抽帧 截帧 帧 图片 封面 批量 png jpg zip", category: "视频工具" },
  { name: "密码UUID", title: "密码与 UUID 生成", href: "/password-generator", icon: TbKey, keywords: "安全 随机 密码 password uuid v4 批量", category: "编码与开发" },
  { name: "正则测试", title: "正则表达式测试", href: "/regex-tester", icon: TbRegex, keywords: "regex regexp 匹配 捕获组 高亮 javascript", category: "编码与开发" },
  { name: "JWT", title: "JWT 解析", href: "/jwt-decoder", icon: TbShieldLock, keywords: "token bearer json 令牌 解码 载荷 过期", category: "编码与开发" },
  { name: "条形码", title: "条形码生成", href: "/barcode-generator", icon: TbBarcode, keywords: "barcode code128 code39 ean upc itf svg png", category: "编码与开发" },
  { name: "节拍器", title: "节拍器", href: "/metronome", icon: TbMetronome, keywords: "音乐 bpm tempo 节奏 重拍 敲击 测速 练习", category: "音频工具" },
  { name: "ICO图标", title: "ICO 图标制作", href: "/ico-generator", icon: TbPhoto, keywords: "favicon 图标 ico icon png 透明 多尺寸", category: "图片与设计" },
  { name: "抖音", title: "抖音视频解析", href: "/douyin", icon: SiTiktok, keywords: "短视频 链接 播放 下载", category: "视频工具" },
  { name: "B站", title: "B站视频解析", href: "/bilibili", icon: SiBilibili, keywords: "哔哩哔哩 bilibili 视频 链接 下载", category: "视频工具" },
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
  { name: "Unity资源包", title: "Unity 资源包预览", href: "/unity-package", icon: TbPackage, keywords: "unitypackage unity 资源包 游戏 素材 预览 模型 图片 音频 脚本 meta guid 解包 提取", category: "编码与开发" },
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
  { name: "文本格式", title: "文本格式转换", href: "/text-format", icon: TbTextGrammar, keywords: "文字 大小写 驼峰 下划线 简体 繁体 全角 半角 行去重", category: "文字与文档" },
  { name: "文本编辑器", title: "纯文本编辑器", href: "/plain-text-editor", icon: TbNotes, keywords: "文字 txt 编辑 打开 下载 查找 替换 撤销 草稿 codemirror", category: "文字与文档" },
  { name: "字数统计", title: "字数统计", href: "/word-counter", icon: FiFileText, keywords: "文字 字符 词数 段落 行数 阅读时长", category: "文字与文档" },
  { name: "抽签大转盘", title: "抽签大转盘", href: "/lottery-wheel", icon: TbWheel, keywords: "抽奖 名单 导入 随机 选择 csv excel", category: "时间与生活" },
  { name: "短链接", title: "短链接生成", href: "/short-link", icon: TbLink, keywords: "网址 缩短 链接 分享 url", category: "设备与网络" },
  { name: "表达式", title: "表达式计算", href: "/expression-calculator", icon: TbMathFunction, keywords: "科学计算 数学 公式 分数 复数 变量 代入 化简 三角函数 根号", category: "计算与换算" },
  { name: "方程", title: "方程求解", href: "/equation-solver", icon: TbVariable, keywords: "科学计算 数学 一元 二次 方程组 未知数 实数 复数 求解", category: "计算与换算" },
  { name: "微积分", title: "微积分计算", href: "/calculus", icon: TbFunction, keywords: "科学计算 数学 求导 导数 定积分 极限 上限 下限", category: "计算与换算" },
  { name: "矩阵", title: "矩阵运算", href: "/matrix-calculator", icon: TbMatrix, keywords: "科学计算 数学 线性代数 行列式 逆矩阵 转置 乘法", category: "计算与换算" },
  { name: "统计", title: "数据统计", href: "/statistics", icon: TbChartDots, keywords: "科学计算 数学 数据 均值 中位数 极值 标准差 方差 样本 总体", category: "计算与换算" },
  { name: "数论", title: "数论与组合", href: "/number-theory", icon: TbNumbers, keywords: "科学计算 数学 质数 素数 因数 公约数 公倍数 排列 组合 整数", category: "计算与换算" },
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
  { name: "PDF页面", title: "PDF 页面管理", href: "/pdf-pages", icon: TbFileTypePdf, keywords: "文档 合并 拆分 删除 排序 旋转 页码", category: "文字与文档" },
  { name: "文本对比", title: "文本差异对比", href: "/text-diff", icon: TbTextGrammar, keywords: "文字 左右 diff 差异 高亮 增加 删除 修改", category: "文字与文档" },
  { name: "批量重命名", title: "批量文件重命名", href: "/batch-rename", icon: TbNotes, keywords: "文件 序号 替换 日期 名称 预览 zip 下载", category: "编码与开发" },
  { name: "图片OCR", title: "图片文字识别 OCR", href: "/image-ocr", icon: TbScan, keywords: "文字 图像 中英文 识别 tesseract 复制 导出", category: "图片与设计" },
  { name: "JSON", title: "JSON 格式化与校验", href: "/json-formatter", icon: TbPhotoCode, keywords: "开发 数据 压缩 格式化 校验 错误 定位", category: "编码与开发" },
  { name: "Markdown", title: "Markdown 编辑与预览", href: "/markdown-editor", icon: FiEdit3, keywords: "文字 md 实时 预览 html 文档 导出", category: "文字与文档" },
  { name: "ZIP", title: "ZIP 打包与解压", href: "/zip", icon: TbNotes, keywords: "文件 压缩包 预览 提取 下载 fflate", category: "编码与开发" },
  { name: "字幕", title: "字幕编辑与转换", href: "/subtitle-editor", icon: TbTextGrammar, keywords: "视频 srt vtt 文字 编辑 时间 偏移 同步", category: "视频工具" },
  { name: "音频裁剪", title: "音频裁剪与拼接", href: "/audio-editor", icon: TbWaveSine, keywords: "声音 区间 剪辑 合并 多段 淡入 淡出 wav", category: "音频工具" },
  { name: "EXIF", title: "图片 EXIF 查看与清除", href: "/image-exif", icon: TbShieldLock, keywords: "图片 元数据 gps 隐私 相机 照片 信息 删除", category: "图片与设计" },
  { name: "时间戳", title: "时间戳转换", href: "/timestamp", icon: TbClock, keywords: "unix 秒 毫秒 日期 时区 epoch UTC", category: "时间与生活" },
  { name: "Unicode", title: "Unicode 字符检查", href: "/unicode-inspector", icon: TbTypography, keywords: "编码 文字 utf8 utf16 零宽 隐藏 空格 字符", category: "编码与开发" },
  { name: "无缝贴图", title: "无缝贴图检查器", href: "/seamless-texture", icon: TbGridDots, keywords: "图片 texture 重复 平铺 缩放 接缝 辅助线", category: "图片与设计" },
  { name: "通道打包", title: "贴图通道打包", href: "/channel-packer", icon: TbPhotoCode, keywords: "图片 texture RGBA ORM 通道 来源 反转 png", category: "图片与设计" },
  { name: "全景图", title: "360° 全景图预览", href: "/panorama", icon: TbRotate360, keywords: "图片 等距柱状 360 panorama 拖动 视角 缩放", category: "图片与设计" },
  { name: "法线图", title: "高度图转法线图", href: "/height-to-normal", icon: TbPhoto, keywords: "图片 贴图 height normal 强度 反转 方向 png", category: "图片与设计" },
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
    if (isToolViewMode(value)) return value;
  } catch { /* Fall through to the viewport default. */ }
  return window.matchMedia("(max-width: 680px)").matches ? "groups" : "cards";
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
  const [mobileCategoriesOpen, setMobileCategoriesOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<ToolCategory>>(() => new Set([categoryOrder[0]]));
  const [revealCycle, setRevealCycle] = useState(0);
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
    const restorePreferences = () => {
      setView(readViewPreference());
      setFavorites(readFavorites());
    };
    const handleViewChange = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (isToolViewMode(value)) {
        setView(value);
        setRevealCycle((current) => current + 1);
      }
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
    const handleStorage = (event: StorageEvent) => {
      if (event.key === favoritesStorageKey) setFavorites(parseFavoriteHrefs(event.newValue));
      if (event.key === toolViewStorageKey) {
        const value = event.newValue;
        if (isToolViewMode(value)) setView(value);
      }
    };
    const replayToolAnimation = () => setRevealCycle((current) => current + 1);
    window.addEventListener(toolViewChangeEvent, handleViewChange);
    window.addEventListener(openFavoritesEvent, toggleFavorites);
    window.addEventListener(replayToolAnimationEvent, replayToolAnimation);
    window.addEventListener("hashchange", handleHash);
    window.addEventListener("storage", handleStorage);
    restorePreferences();
    handleHash();
    return () => {
      window.removeEventListener(toolViewChangeEvent, handleViewChange);
      window.removeEventListener(openFavoritesEvent, toggleFavorites);
      window.removeEventListener(replayToolAnimationEvent, replayToolAnimation);
      window.removeEventListener("hashchange", handleHash);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const browser = browserRef.current;
    if (!browser) return;

    let observer: IntersectionObserver | undefined;
    let revealFrame: number | undefined;
    let items: HTMLElement[] = [];
    const resetFrame = window.requestAnimationFrame(() => {
      const selector = view === "groups"
        ? ".tool-category-collapsible"
        : ".tool-category-heading, .tool-card-shell";
      items = Array.from(browser.querySelectorAll<HTMLElement>(selector));
      items.forEach((item, index) => {
        item.classList.add("is-reveal-resetting");
        item.removeAttribute("data-revealed");
        item.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 45}ms`);
      });

      browser.getBoundingClientRect();
      revealFrame = window.requestAnimationFrame(() => {
        items.forEach((item) => item.classList.remove("is-reveal-resetting"));

        if (!("IntersectionObserver" in window)) {
          items.forEach((item) => item.setAttribute("data-revealed", "true"));
          return;
        }

        observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const item = entry.target as HTMLElement;
            const viewportHalf = window.innerHeight * 0.5;
            const visibleEnough = entry.intersectionRatio >= 0.5
              || (entry.boundingClientRect.height > window.innerHeight && entry.intersectionRect.height >= viewportHalf);
            if (!visibleEnough) return;
            item.setAttribute("data-revealed", "true");
            observer?.unobserve(item);
          });
        }, { rootMargin: "0px", threshold: [0, 0.5] });
        items.forEach((item) => observer?.observe(item));
      });
    });

    return () => {
      window.cancelAnimationFrame(resetFrame);
      if (revealFrame !== undefined) window.cancelAnimationFrame(revealFrame);
      observer?.disconnect();
      items.forEach((item) => item.classList.remove("is-reveal-resetting"));
    };
  }, [activeCategory, favoritesOnly, revealCycle, searching, view, visibleTools]);

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
      <div className={`tool-card-shell${view === "groups" ? "" : " is-reveal-pending"}`} key={tool.href}>
        <ToolCardLink external={tool.external} href={tool.href} style={{ "--delay": `${index * 35 + 80}ms` } as CSSProperties} touchPreview={view === "cards"}>
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
  const expandFilteredGroups = searching || favoritesOnly || activeCategory !== "全部";

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
        <button className={`favorites-filter${favoritesOnly ? " is-active" : ""}`} type="button" onClick={() => setFavoritesOnly((value) => !value)} aria-label={favoritesOnly ? "关闭收藏夹" : "打开收藏夹"} aria-pressed={favoritesOnly}>
          <FiStar aria-hidden="true" /><span className="favorites-filter-label">{favoritesOnly ? "查看全部" : "收藏夹"}</span>
        </button>
      </div>

      <nav className="tool-category-tabs tool-category-tabs-desktop" aria-label="工具分类">
        <button className={activeCategory === "全部" ? "is-active" : ""} type="button" onClick={() => setActiveCategory("全部")} aria-pressed={activeCategory === "全部"}>全部</button>
        {categoryOrder.map((category) => (
          <button className={activeCategory === category ? "is-active" : ""} type="button" key={category} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category}>{category}</button>
        ))}
      </nav>
      <div className={`tool-category-mobile${mobileCategoriesOpen ? " is-open" : ""}`}>
        <nav className="tool-category-tabs tool-category-tabs-mobile" aria-label="手机端工具分类">
          <button className={activeCategory === "全部" ? "is-active" : ""} type="button" onClick={() => setActiveCategory("全部")} aria-pressed={activeCategory === "全部"}>全部</button>
          {primaryMobileCategories.map((category) => (
            <button className={activeCategory === category ? "is-active" : ""} type="button" key={category} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category}>{category}</button>
          ))}
          <button className={secondaryMobileCategories.includes(activeCategory as ToolCategory) ? "is-active" : ""} type="button" onClick={() => setMobileCategoriesOpen((value) => !value)} aria-expanded={mobileCategoriesOpen} aria-controls="more-tool-categories">{mobileCategoriesOpen ? "收起" : "更多"}</button>
        </nav>
        {mobileCategoriesOpen ? (
          <nav className="tool-category-more" id="more-tool-categories" aria-label="更多工具分类">
            {secondaryMobileCategories.map((category) => (
              <button className={activeCategory === category ? "is-active" : ""} type="button" key={category} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category}>{category}</button>
            ))}
          </nav>
        ) : null}
      </div>

      {favoritesOnly ? (
        <div className="favorites-heading">
          <div><FiStar aria-hidden="true" /><strong>收藏夹</strong></div>
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
          ) : groupedTools.map((group, categoryIndex) => {
            const groupExpanded = expandFilteredGroups || expandedCategories.has(group.category);
            const groupPanelId = `tool-group-${categoryIndex}`;
            return view === "groups" ? (
              <section
                className={`tool-category tool-category-collapsible is-reveal-pending${groupExpanded ? " is-expanded" : ""}`}
                key={group.category}
              >
                <button
                  className="tool-category-summary"
                  type="button"
                  aria-expanded={groupExpanded}
                  aria-controls={groupPanelId}
                  onClick={() => { if (!expandFilteredGroups) setCategoryExpanded(group.category, !groupExpanded); }}
                >
                  <span>{group.category}</span><span className="tool-category-count">{group.tools.length} 项</span>
                </button>
                <div
                  className="tool-category-collapse"
                  id={groupPanelId}
                  aria-hidden={!groupExpanded}
                  inert={!groupExpanded}
                  style={{
                    "--tool-group-height": `${Math.ceil(group.tools.length / 2) * 100 + 24}px`,
                    "--tool-group-height-mobile": `${group.tools.length * 100 + 24}px`,
                  } as CSSProperties}
                >
                  <div className="tool-category-collapse-inner">
                    <nav className={`tool-grid${searching ? " is-searching" : ""}`} aria-label={`${group.category}工具`}>{group.tools.map((tool, index) => renderTool(tool, index))}</nav>
                  </div>
                </div>
              </section>
            ) : (
            <section className="tool-category" key={group.category} aria-labelledby={`category-${categoryIndex}`}>
              <div className="tool-category-heading is-reveal-pending"><h2 id={`category-${categoryIndex}`}>{group.category}</h2><span>{group.tools.length} 项</span></div>
              <nav className={`tool-grid${searching ? " is-searching" : ""}`} aria-label={`${group.category}工具`}>{group.tools.map((tool, index) => renderTool(tool, index))}</nav>
            </section>
            );
          })}
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
