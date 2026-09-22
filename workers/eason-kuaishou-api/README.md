# 快手视频解析 Worker

该 Worker 直接读取快手公开分享页与媒体地址，不调用任何第三方解析 API。

## 接口

- `GET /?url=<快手分享链接>`：返回可播放的视频流。
- `GET /api/video?url=<快手分享链接>`：返回作品信息和站内播放链接。
- `GET /health`：健康检查。

短链接跳转、作品页和视频 CDN 都有严格的域名白名单、响应大小上限、超时及重定向限制；视频响应采用流式转发并支持 Range 请求。

```bash
npx wrangler deploy --config workers/eason-kuaishou-api/wrangler.jsonc
```
