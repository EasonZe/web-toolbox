# 辅助 Workers

生产站点将视频解析服务拆分为两个独立的 Cloudflare Workers：

| Worker | 域名 | 本仓库是否含源码 |
| --- | --- | --- |
| `eason-daoyin-api` | `douyin-api.easonzhan.xyz` | `eason-daoyin-api/` |
| `eason-bilibili-api` | `bilibili-api.easonzhan.xyz` | `eason-bilibili-api/` |

两个 Worker 都可以从本仓库独立部署。抖音实现仅访问平台公开页面、官方播放器或认可的媒体 CDN，不依赖第三方解析 API。详细拓扑和部署方式见 `docs/architecture.md` 与 `docs/deployment.md`。
