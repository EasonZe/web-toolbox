# Web Toolbox

[![CI](https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml/badge.svg)](https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live site](https://img.shields.io/badge/Live-tool.easonzhan.xyz-2ea8e5)](https://tool.easonzhan.xyz/)

一个面向生产环境的多功能在线工具箱。项目基于 Next.js、vinext 与 Cloudflare Workers，包含 50 余个视频、音频、图片、文档、开发和生活类工具；大部分媒体处理在浏览器本地完成。

线上站点：<https://tool.easonzhan.xyz/>

## 特性

- 视频：链接解析、格式转换、压缩、倒放、转 GIF、提取音频和水印。
- 音频：格式转换、压缩、倒放、变速变调、麦克风测试与录音。
- 图片与设计：格式转换、压缩、裁剪、拼接、水印、取色、像素画、拼豆图纸、智能抠图、二维码和 3D 模型预览。
- 文字与文档：纯文本编辑、格式转换、字数统计、ASCII 字符画、花体字以及 Word/PDF 转换。
- 开发与生活：文件哈希、进制转换、函数绘图、摩斯电码、短链接、汇率、全球时间、日期计算、倒计时和设备测试。
- 首页支持搜索、分类、收藏、四种列表布局、浅色/深色主题和自定义主题色。
- 响应式设计，支持桌面、平板和手机。

## 技术栈

- React 19、Next.js 16、TypeScript
- vinext、Vite、Cloudflare Workers
- Cloudflare D1、Images、Rate Limiting
- Node.js 原生测试运行器、ESLint

## 快速开始

### 环境要求

- Node.js `>= 22.13.0`
- npm `>= 10`

### 安装与启动

```bash
git clone https://github.com/EasonZe/web-toolbox.git
cd web-toolbox
npm ci
npm run dev
```

开发服务器启动后，打开终端中显示的本地地址。

### 质量检查

```bash
npm run check
```

该命令依次运行 ESLint、TypeScript 检查、生产构建和全部自动化测试。也可以单独执行：

```bash
npm run lint
npm run typecheck
npm test
```

## 项目结构

```text
app/                         页面、组件和浏览器端工具逻辑
migrations/short-links/      D1 数据库迁移
public/                      静态资源、字体许可证和生成型运行时资源
scripts/                     构建前资源准备脚本
tests/                       自动化回归测试
types/                       Cloudflare 与第三方类型声明
worker/                      主站 Cloudflare Worker 入口
workers/eason-bilibili-api/  独立的 Bilibili 解析 Worker
docs/                        架构与部署文档
wrangler.jsonc               主站生产部署配置
```

## 部署

项目面向 Cloudflare Workers 部署。主站需要 Assets、Images、D1 与 Rate Limiting 绑定；Bilibili 解析服务是独立 Worker。完整步骤、绑定说明与自定义域名配置见 [部署文档](docs/deployment.md)。

```bash
npm ci
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy --keep-vars
```

`wrangler.jsonc` 中的生产域名和资源 ID 属于当前部署。Fork 后请替换为你自己的 Cloudflare 资源，不要直接复用生产绑定。

## 隐私与安全

- 图片、视频、音频和文本工具优先在浏览器本地处理。
- 视频解析、实时汇率、IP 查询、短链接等功能需要访问网络服务。
- 不要向公共 Issue 提交密钥、个人文件或敏感链接。
- 安全问题请按照 [安全政策](SECURITY.md) 私下报告。

视频解析功能仅应用于你拥有权利或已获授权的内容，并应遵守目标平台条款及当地法律。上游接口变化可能导致解析功能暂时不可用。

## 参与贡献

欢迎提交 Issue 和 Pull Request。开始前请阅读 [贡献指南](CONTRIBUTING.md) 与 [行为准则](CODE_OF_CONDUCT.md)。

第三方依赖及其许可证说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。锁定版本以 `package-lock.json` 为准。

## 许可证

项目使用 [MIT License](LICENSE)。第三方组件、字体和随包资源仍遵循各自许可证。
