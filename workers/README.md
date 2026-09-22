# 辅助 Workers

生产站点将视频解析服务拆分为三个独立的 Cloudflare Workers：

| Worker | 域名 | 本仓库是否含源码 |
| --- | --- | --- |
| `eason-daoyin-api` | `douyin-api.easonzhan.xyz` | 否 |
| `eason-bilibili-api` | `bilibili-api.easonzhan.xyz` | `eason-bilibili-api/` |
| `eason-kuaishou-api` | `kuaishou-api.easonzhan.xyz` | 否 |

缺少源码的 Worker 作为生产外部依赖记录，不应被误认为可由本仓库直接部署。详细拓扑和替换方式见 `docs/architecture.md` 与 `docs/deployment.md`。
