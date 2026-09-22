# 辅助 Workers

生产站点将视频解析服务拆分为三个独立的 Cloudflare Workers：

| Worker | 域名 | 本仓库是否含源码 |
| --- | --- | --- |
| `eason-daoyin-api` | `douyin-api.easonzhan.xyz` | `eason-daoyin-api/` |
| `eason-bilibili-api` | `bilibili-api.easonzhan.xyz` | `eason-bilibili-api/` |
| `eason-kuaishou-api` | `kuaishou-api.easonzhan.xyz` | `eason-kuaishou-api/` |

三个 Worker 都可以从本仓库独立部署。抖音和快手实现仅访问对应平台公开页面、官方播放器或认可的媒体 CDN，不依赖第三方解析 API。详细拓扑和部署方式见 `docs/architecture.md` 与 `docs/deployment.md`。
