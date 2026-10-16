# eason-bilibili-api

多功能工具箱的 Bilibili 链接解析与媒体代理 Worker。

## 端点

- `GET /health`：健康检查；
- `GET /api/video?url=...`：返回视频元数据；
- `GET|HEAD /?url=...`、`/video?url=...`、`/play?url=...`：返回或代理视频媒体。

仅允许 Bilibili 分享域名和受支持的媒体 CDN，包含超时、重定向限制、响应体大小限制以及 Range 请求转发。

## 缓存与性能

- 短链接映射缓存 1 小时；BV 号与分 P 作为播放解析缓存键，预览、下载、HEAD 和拖动进度条复用同一结果。
- 播放地址最多缓存 5 分钟，并根据可识别的签名到期时间提前失效。缓存地址被 CDN 拒绝时刷新一次，保留原 Range／If-Range。
- 同一 isolate 合并正在进行的同视频解析；小型 LRU 内存缓存与当前节点 Cache API 配合，缓存故障不影响平台解析。
- JSON 响应体、短链接、TCP 回退和媒体响应头均有可取消的总超时；TCP 收到完整响应后即结束，不再等待对端关闭连接。
- `Server-Timing` 标记解析与媒体响应头耗时，`X-Parser-Cache` 区分 `miss`、`memory`、`edge` 与 `shared`。

Cache API 只在当前 Cloudflare 节点共享，合并任务只在当前 isolate 生效，不是全球缓存或全局并发锁。首次解析仍取决于平台响应与网络；媒体正文持续流式传输，不受响应头超时截断。

## 本地与部署

```bash
npx wrangler dev --config workers/eason-bilibili-api/wrangler.jsonc
npx wrangler deploy --config workers/eason-bilibili-api/wrangler.jsonc --dry-run
```

Fork 后必须修改配置中的 Worker 名称和自定义域名。使用者应确保用途符合平台条款、内容授权和当地法律。
