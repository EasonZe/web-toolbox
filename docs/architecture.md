# 系统架构

## 概览

Web Toolbox 是部署在 Cloudflare Workers 上的全栈 Web 应用。界面由 Next.js、React 与 vinext 构建，静态资源通过 Workers Assets 提供，少量需要服务端能力的功能由 Worker 路由处理。

```text
Browser
  ├─ local media/text processing
  ├─ Web Toolbox Worker (pages, assets, short links, image transforms)
  │    ├─ Assets
  │    ├─ Images
  │    ├─ D1: SHORT_LINKS
  │    └─ Rate Limiting: LINK_LIMITER
  └─ video parser Workers
       ├─ eason-douyin-api
       ├─ eason-bilibili-api
       └─ eason-kuaishou-api
```

## 浏览器本地处理

视频转码、图片处理、音频处理、文本编辑和多数文档操作优先在浏览器内完成。这样可以减少文件离开用户设备的场景，但大文件处理能力仍受浏览器内存和设备性能限制。

## 主站 Worker

`worker/index.ts` 负责：

- 交给 vinext 处理页面与服务端渲染；
- 提供构建后的静态资源；
- 处理图片转换绑定；
- 提供短链接创建与跳转接口；
- 设置生产响应与安全相关行为。

## 视频解析 Workers

视频解析服务与主站隔离部署，避免上游响应、媒体代理和主站渲染相互影响。

| Worker | 生产域名 | 仓库状态 |
| --- | --- | --- |
| `eason-douyin-api` | `douyin-api.easonzhan.xyz` | 外部部署依赖，当前仓库不包含源码 |
| `eason-bilibili-api` | `bilibili-api.easonzhan.xyz` | 源码位于 `workers/eason-bilibili-api/` |
| `eason-kuaishou-api` | `kuaishou-api.easonzhan.xyz` | 外部部署依赖，当前仓库不包含源码 |

Fork 可以保留这些公共端点用于开发验证，也可以在对应页面中替换为自己的兼容 API。生产使用前应自行评估平台条款、可用性、限流和合规要求。

## 数据与隐私边界

- D1 仅用于短链接目标、创建时间和可选过期时间。
- 仓库不应包含 Cloudflare API Token、用户文件或 `.env` 内容。
- Cloudflare 资源 ID 不是密钥，但 Fork 部署时必须替换为自己的资源。
- 外部 API 返回的数据不应被视为可信 HTML；新增界面必须继续保持输出转义或净化。
