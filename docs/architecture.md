# 系统架构

## 概览

多功能工具箱是部署在 Cloudflare Workers 上的全栈 Web 应用。界面由 Next.js、React 与 vinext 构建，静态资源通过 Workers Assets 提供，少量需要服务端能力的功能由 Worker 路由处理。

```text
Browser
  ├─ local media/text processing
  ├─ 多功能工具箱 Worker（页面、静态资源、短链接、图片转换）
  │    ├─ Assets
  │    ├─ Images
  │    ├─ D1: SHORT_LINKS
  │    └─ Rate Limiting: LINK_LIMITER
  └─ video parser Workers
       ├─ eason-daoyin-api
       └─ eason-bilibili-api
```

## 浏览器本地处理

视频转码、图片处理、音频处理、文本编辑和多数文档操作优先在浏览器内完成。这样可以减少文件离开用户设备的场景，但大文件处理能力仍受浏览器内存和设备性能限制。

八类应用任务 Worker 的 client 通过 `app/lib/worker-task.ts` 统一管理成功、错误、取消、可选超时和消息反序列化失败，结束时清理处理器与线程；各自保留协议、时限和传输规则。文件哈希仍流式读取且不设固定总时限，Word 生成沿用组件的无进展超时。`PdfLocalPreview` 与 PDF 页面管理按输入文件持有一个 `pdf-preview-session`，切页取消旧绘制但复用已解析文档，换文件或卸载时销毁；画布仍逐页释放，各自保留渲染比例，受限 PDF-to-Word 引擎未引入。

构建前的 `npm run check:integrity` 直接读取安装包元数据，并用静态 AST / XML 校验现有工具注册、页面和 sitemap，不执行界面代码或更改列表。范围与验证数据见 [工程优化记录](toolknit-optimization.md)。

部分文件工具可通过 `app/lib/tool-handoff.ts` 与 `app/components/tool-handoff.tsx` 继续处理结果：单标签页、单待接收批次、五分钟期限、固定目标白名单，服务端快照为空；用户确认后交给原输入处理函数。正常下载保留，不使用持久化存储或文件上传接口，不改变路由。支持范围与测试边界见 [结果衔接](tool-workflows.md)。

图片压缩与格式转换通过 `app/lib/serial-batch.ts` 顺序执行，支持停止后保留成功结果、继续未完成项；同步任务锁与上传版本隔离旧回调，原生解码 / 编码等待自身收尾再释放。画布、bitmap 与 URL 仍由各工具负责，不是持久化全局队列。依据与验证见 [图片批处理生命周期](image-batch-lifecycle.md)。

## 主站 Worker

`worker/index.ts` 负责：

- 交给 vinext 处理页面与服务端渲染；
- 提供构建后的静态资源；
- 处理图片转换绑定；
- 提供短链接创建与跳转接口；
- 设置生产响应与安全相关行为。

## 视频解析 Workers

视频解析服务与主站隔离部署，避免平台响应、媒体代理和主站渲染相互影响。

| Worker | 生产域名 | 数据来源 | 仓库状态 |
| --- | --- | --- | --- |
| `eason-daoyin-api` | `douyin-api.easonzhan.xyz` | 抖音公开页面、官方播放器与媒体地址；使用 Cloudflare Browser Rendering 回退 | 源码位于 `workers/eason-daoyin-api/` |
| `eason-bilibili-api` | `bilibili-api.easonzhan.xyz` | `api.bilibili.com` 公开播放接口与受限媒体 CDN | 源码位于 `workers/eason-bilibili-api/` |

抖音 Worker 不调用第三方解析 API。两个生产端点不是本仓库承诺长期开放的通用 API；Fork 可以直接部署仓库内对应 Worker，并在页面中替换为自己的域名。生产使用前应评估平台条款、内容授权、可用性、限流、隐私和合规要求。

## 数据与隐私边界

- D1 仅用于短链接目标、创建时间和可选过期时间。
- 仓库不应包含 Cloudflare API Token、用户文件或 `.env` 内容。
- Cloudflare 资源 ID 不是密钥，但 Fork 部署时必须替换为自己的资源。
- 外部 API 返回的数据不应被视为可信 HTML；新增界面必须继续保持输出转义或净化。
