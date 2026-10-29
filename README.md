<p align="center">
  <img src="./public/images/toolbox-logo.png" width="152" alt="多功能工具箱">
</p>

<h1 align="center">多功能工具箱</h1>

<p align="center">浏览器里的实用工具</p>

<p align="center">
  <a href="./README.md"><strong>简体中文</strong></a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <a href="https://tool.easonzhan.xyz/"><img alt="Website" src="https://img.shields.io/badge/Website-tool.easonzhan.xyz-0ea5e9"></a>
  <a href="https://github.com/EasonZe/web-toolbox/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/EasonZe/web-toolbox"></a>
  <a href="https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-2563eb"></a>
  <a href="https://github.com/EasonZe/web-toolbox/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/EasonZe/web-toolbox?style=flat&logo=github"></a>
</p>

<p align="center">
  <img alt="Node.js 22+" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white">
  <img alt="124 tools" src="https://img.shields.io/badge/Tools-124-7c6fb1">
</p>

[在线使用](https://tool.easonzhan.xyz/) · [版本更新](https://github.com/EasonZe/web-toolbox/releases) · [问题反馈](https://github.com/EasonZe/web-toolbox/issues)

多功能工具箱收录 124 个视频、音频、图片、文档、开发与生活工具，无需安装。多数文件和文本处理在浏览器本地完成。

## 工具有哪些

| 分类 | 常用工具 |
| --- | --- |
| 视频 | 格式转换、压缩、裁剪、水印、转 GIF、截图与取帧、视频链接解析 |
| 音频 | 格式转换、裁剪与拼接、变速变调、倒放、录音、节拍器、BPM 分析 |
| 图片与设计 | 压缩、裁剪、OCR、圆角边框、画布、双色调、锐化与模糊、应用图标、GIF 编辑、证件照、贴图与 3D 预览 |
| 文字与文档 | 文本编辑与对比、Markdown、字幕、PDF 页面管理与导出、扫描件、本地字体预览、PPTX 提取 |
| 编码与开发 | JSON、YAML、路径提取、哈希与 HMAC、正则、JWT、二维码、ZIP、Unity 资源包预览 |
| 计算与换算 | 表达式、方程、微积分、矩阵、统计、数论、单位与汇率换算 |
| 时间与生活 | 世界时钟、倒计时、日期计算、抽签、打字练习 |
| 设备与网络 | 麦克风、键盘与屏幕测试、IP 查询、子网计算、短链接 |

支持搜索、分类、收藏、四种列表布局、深浅色模式和自定义主题色。部分图片与 PDF 结果可以直接交给下一个工具，详见[工具衔接](docs/tool-workflows.md)。

## 本地运行

需要 Node.js 22.13 或更高版本及 npm 11.12.1，与 CI 保持一致。

```bash
git clone https://github.com/EasonZe/web-toolbox.git
cd web-toolbox
npm install --global npm@11.12.1
npm ci
npm run dev
```

提交前运行检查：

```bash
npm run check
```

## 部署

使用 Cloudflare Workers。Fork 后请替换 `wrangler.jsonc` 中的域名、资源 ID 和绑定，步骤见[部署文档](docs/deployment.md)。

```bash
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy --keep-vars
```

抖音与 B 站解析使用独立 Worker，源码位于 `workers/`，需要单独部署。

## 使用说明

- 本地处理能力受设备内存和浏览器支持影响，详见[处理范围](docs/resource-limits.md)。
- 视频解析、汇率、IP 查询和短链接等功能需要联网。视频内容应由你拥有或已获使用授权。
- PDF 裁剪只隐藏页面区域，不能用于安全脱敏；JWT 解析不验证签名。

## 文档与参与

[系统架构](docs/architecture.md) · [贡献指南](CONTRIBUTING.md) · [安全政策](SECURITY.md) · [第三方声明](THIRD_PARTY_NOTICES.md)

由 [EasonZe](https://github.com/EasonZe) 维护，欢迎提交 Issue 和 Pull Request。

项目代码使用 [MIT License](LICENSE)。第三方组件、字体、模型及素材遵循各自许可证。
