# 抖音视频解析 Worker

该 Worker 直接读取抖音公开分享页、官方播放器与媒体地址，不调用第三方解析 API。

## 接口

- `GET /?url=<抖音分享链接>`：返回可播放的视频流。
- `GET /api/video?url=<抖音分享链接>`：返回作品信息和站内播放链接。
- `GET /health`：健康检查。

解析优先使用公开分享页；页面结构变化时，通过 Cloudflare Browser Rendering 读取官方页面作为回退。媒体代理只允许抖音认可的 CDN 域名，并保留 Range 请求。

```bash
npx wrangler deploy --config workers/eason-daoyin-api/wrangler.jsonc
```
