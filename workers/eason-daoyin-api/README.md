# 抖音视频解析 Worker

该 Worker 直接读取抖音公开分享页、官方播放器与媒体地址，不调用第三方解析 API。

## 接口

- `GET /?url=<抖音分享链接>`：返回可播放的视频流。
- `GET /api/video?url=<抖音分享链接>`：返回作品信息和站内播放链接。
- `GET /health`：健康检查。

解析优先使用公开分享页；页面结构变化时，通过 Cloudflare Browser Rendering 读取官方页面作为回退。媒体代理只允许抖音认可的 CDN 域名，并保留 Range 请求。

## 缓存与性能

- 短链接映射缓存 1 小时；API 返回作品 ID 播放链接，避免再次跳转分享短链接。
- 播放地址采用 LRU 内存缓存与节点 Cache API，最多 5 分钟，并预留签名到期安全余量；同一 isolate 内的同视频并发请求共用解析结果，不共享视频正文流。
- CDN 拒绝已缓存地址时仅刷新一次，HEAD、Range 与 If-Range 按原请求转发。
- 分享页面最长 6 秒，浏览器回退总预算 26 秒，元数据解析总预算 32 秒。回退只启动一轮 Puppeteer，媒体响应到达后立即使用，取消／超时后关闭浏览器。
- 每个 isolate 最多同时运行 2 个浏览器回退；平台限流后短暂冷却，不长期保持空闲浏览器，不增加新付费资源或第三方解析服务。
- `Server-Timing` 标记各阶段耗时，`X-Parser-Cache` 区分 `miss`、`memory`、`edge` 与 `shared`。

Cache API 只在当前 Cloudflare 节点共享，缓存和并发控制不是全球锁。新视频首次解析仍可能受页面结构、网络和平台限制影响；浏览器回退失败会明确返回错误，不保证每个链接都能解析。

```bash
npx wrangler deploy --config workers/eason-daoyin-api/wrangler.jsonc
```
