# 依赖与上游审查

审查日期：2026-09-22

## 结论

当前仓库具备公开发布到 GitHub 的基础条件：许可证、社区文件、持续集成、依赖锁、自动更新、安全报告渠道、部署说明和第三方声明均已提供；仓库内容扫描未发现 API Token、`.env`、用户文件或 Windows 本地绝对路径。

需要明确的边界是：仓库可以完整构建并部署主站与 Bilibili Worker，但生产环境中的抖音和快手 Worker 源码未收录。因此本仓库不是三个解析服务的完全自托管发行版，Fork 必须自行替换这两个外部部署依赖。

## npm 依赖

- 直接运行时依赖：37 个。
- 直接开发依赖：20 个。
- 锁文件解析总依赖：908 个，其中生产依赖 247 个、开发依赖 582 个、可选依赖 199 个。
- `npm audit`：0 个已知漏洞（低、中、高、严重均为 0）。
- `package-lock.json` 已提交；GitHub Dependabot 每周检查 npm 依赖、每月检查 Actions。

主要许可证为 MIT、ISC、Apache-2.0、MPL-2.0、BSD-2-Clause 与 BSD-3-Clause。需特别留意：

- `mediabunny`、`@mediabunny/mp3-encoder` 与 `@soundtouchjs/audio-worklet` 使用 MPL-2.0；
- `sharp` 的可选平台包包含 LGPL-3.0-or-later 的 `libvips` 二进制；
- `caniuse-lite` 使用 CC-BY-4.0；
- `jszip` 提供 MIT 或 GPL-3.0-or-later 双许可，本项目按 MIT 使用；
- `png-js` 的 `package.json` 未填写许可证字段，但发布包内附带 MIT License。

锁定版本并非全部为上游最新版本。为避免未经验证的媒体编解码、React、Next.js 和构建链升级改变现有功能，本次没有批量升级；后续应通过 Dependabot 分批更新，并对每批更新运行 `npm run check`。

## 三个视频 API

本次通过 Cloudflare 已部署 Worker 的版本元数据和脚本内容核对实际请求目标：

| API | 真实 Worker | 上游使用情况 | 可复现性 |
| --- | --- | --- | --- |
| 抖音 | `eason-daoyin-api` | 直接使用抖音公开页面、播放器与媒体地址；通过 Cloudflare Browser Rendering 获取页面信息 | 生产源码未收录，Fork 需自备兼容服务 |
| Bilibili | `eason-bilibili-api` | 直接使用 `api.bilibili.com` 的公开播放接口，并限制代理到认可的媒体 CDN | 源码与 Wrangler 配置已收录，可独立部署 |
| 快手 | `eason-kuaishou-api` | 优先调用 `api.bugpk.com`、`api.qster.top`，失败后回退到快手公开页面与认可的媒体域名 | 生产源码未收录，Fork 需自备兼容服务 |

三个站点页面目前分别请求：

- `https://douyin-api.easonzhan.xyz/?url=`
- `https://bilibili-api.easonzhan.xyz/?url=`
- `https://kuaishou-api.easonzhan.xyz/?url=`

这些域名属于当前生产部署，不构成对第三方 Fork 的长期服务承诺。上游平台与第三方解析接口可能改变响应、限流或停止服务；使用者应自行评估条款、内容授权、隐私和当地法律。

## Cloudflare 配置

- 主站与 Bilibili Worker 均设置了明确的 `compatibility_date`、生产路由和日志可观测性。
- 主站绑定 Assets、Images、D1 与 Rate Limiting；Bilibili Worker 不依赖秘密绑定。
- Cloudflare 资源 ID 不是密钥，但 Fork 不应复用生产资源，部署前必须替换 `wrangler.jsonc` 中的名称、域名和绑定。
- 外部 Worker 若需要密钥，应使用 Cloudflare Worker Secret，不得硬编码或提交到仓库。

## 发布检查清单

```bash
npm ci
npm audit --audit-level=high
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy --config workers/eason-bilibili-api/wrangler.jsonc --dry-run
```

发布前还应确认：工作区干净、没有未跟踪的私密文件、CI 通过，并以 `git diff --check` 检查空白错误。
