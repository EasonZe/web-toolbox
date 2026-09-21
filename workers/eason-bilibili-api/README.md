# eason-bilibili-api

Web Toolbox 的 Bilibili 链接解析与媒体代理 Worker。

## 端点

- `GET /health`：健康检查；
- `GET /api/video?url=...`：返回视频元数据；
- `GET|HEAD /?url=...`、`/video?url=...`、`/play?url=...`：返回或代理视频媒体。

仅允许 Bilibili 分享域名和受支持的媒体 CDN，包含超时、重定向限制、响应体大小限制以及 Range 请求转发。

## 本地与部署

```bash
npx wrangler dev --config workers/eason-bilibili-api/wrangler.jsonc
npx wrangler deploy --config workers/eason-bilibili-api/wrangler.jsonc --dry-run
```

Fork 后必须修改配置中的 Worker 名称和自定义域名。使用者应确保用途符合平台条款、内容授权和当地法律。
