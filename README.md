<p align="center">
  <img src="./public/images/toolbox-logo.png" width="152" alt="多功能工具箱项目标志">
</p>

<h1 align="center">多功能工具箱</h1>

<p align="center">一个干净、响应式、面向生产环境的在线工具集合</p>

<p align="center">
  <a href="./README.md"><strong>简体中文</strong></a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-2563eb.svg"></a>
  <a href="https://tool.easonzhan.xyz/"><img alt="在线体验" src="https://img.shields.io/badge/在线体验-tool.easonzhan.xyz-0ea5e9.svg"></a>
</p>

多功能工具箱基于 React、Next.js、vinext 与 Cloudflare Workers 构建，收录 50 余个视频、音频、图片、文档、开发和生活类工具。多数媒体和文本处理在浏览器本地完成，无需安装客户端。

## 功能

- **视频**：链接解析、格式转换、压缩、倒放、转 GIF、提取音频和水印。
- **音频**：格式转换、压缩、倒放、变速变调、麦克风测试与录音。
- **图片与设计**：压缩、裁剪、拼接、水印、取色、像素画、拼豆图纸、智能抠图、二维码和 3D 模型预览。
- **文字与文档**：纯文本编辑、格式转换、字数统计、ASCII 字符画、简繁转换以及 Word/PDF 工具。
- **开发与生活**：文件哈希、进制转换、函数绘图、摩斯电码、短链接、汇率、全球时间、日期计算、倒计时和设备测试。
- **使用体验**：搜索、分类、收藏、四种列表布局、浅色/深色模式、自定义主题色，以及桌面、平板和手机适配。

## 快速开始

环境要求：Node.js `>= 22.13.0`、npm `>= 10`。

```bash
git clone https://github.com/EasonZe/web-toolbox.git
cd web-toolbox
npm ci
npm run dev
```

提交代码前请运行完整质量检查：

```bash
npm run check
```

该命令会依次执行 ESLint、TypeScript 检查、生产构建和自动化测试。

## 技术架构

| 层级 | 技术 |
| --- | --- |
| 界面与路由 | React 19、Next.js 16、TypeScript、vinext |
| 构建与部署 | Vite、Cloudflare Workers、Wrangler |
| 云端能力 | Workers Assets、Images、D1、Rate Limiting |
| 质量保障 | ESLint、Node.js Test Runner、GitHub Actions、Dependabot |

```text
app/                         页面、组件和浏览器端工具逻辑
worker/                      主站 Cloudflare Worker
workers/eason-bilibili-api/  Bilibili 解析 Worker 源码
migrations/short-links/      D1 数据库迁移
public/                      静态资源与字体许可证
tests/                       自动化回归测试
docs/                        架构、部署与依赖审查文档
```

## 视频解析服务

| 平台 | 生产 Worker | 主要上游 | 仓库状态 |
| --- | --- | --- | --- |
| 抖音 | `eason-daoyin-api` | 抖音公开页面与播放地址 | 外部部署依赖，源码未收录 |
| Bilibili | `eason-bilibili-api` | Bilibili 官方公开播放接口 | 源码已收录 |
| 快手 | `eason-kuaishou-api` | 第三方解析接口，失败后回退到快手公开页面 | 外部部署依赖，源码未收录 |

这些端点不是本仓库的通用公共 API。Fork 若要完全独立部署，需要自行提供兼容的抖音与快手服务，并替换页面中的地址。完整边界与审查结果见 [系统架构](docs/architecture.md)、[部署文档](docs/deployment.md) 和 [依赖与上游审查](docs/dependency-audit.md)。

## 部署

主站面向 Cloudflare Workers 部署，需要配置 Assets、Images、D1 与 Rate Limiting 绑定：

```bash
npm ci
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy --keep-vars
```

`wrangler.jsonc` 中的生产域名和资源 ID 属于当前站点。Fork 后必须替换为自己的 Cloudflare 资源，具体步骤见 [部署文档](docs/deployment.md)。

## 隐私、合规与安全

- 用户文件优先留在浏览器本地；视频解析、汇率、IP 查询和短链接等功能需要访问网络服务。
- 视频解析仅应用于你拥有权利或已获授权的内容，并应遵守目标平台条款及当地法律。
- 不要在公开 Issue 中提交密钥、个人文件或敏感链接；安全问题请按 [安全政策](SECURITY.md) 私下报告。
- 第三方组件及许可证见 [第三方声明](THIRD_PARTY_NOTICES.md)，锁定版本以 `package-lock.json` 为准。

## 参与项目

本项目由 [EasonZe](https://github.com/EasonZe) 发起并维护。欢迎提交 Issue 与 Pull Request；开始前请阅读 [贡献指南](CONTRIBUTING.md) 和 [行为准则](CODE_OF_CONDUCT.md)。

## 许可证

项目代码使用 [MIT License](LICENSE)。第三方组件、字体、模型和随包资源仍遵循各自许可证。
