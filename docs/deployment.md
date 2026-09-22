# Cloudflare 部署

## 前置条件

- Node.js 22.13 或更高版本；
- Cloudflare 账号与 Wrangler 4；
- 可用于 Workers 自定义域名的 Cloudflare Zone。

```bash
npm ci
npx wrangler login
npx wrangler whoami
```

不要把 API Token 写入仓库。CI 部署时应使用 GitHub Actions Secret 或 Cloudflare 的原生 Git 集成。

## 主站资源

主站 `wrangler.jsonc` 需要以下绑定：

| 绑定 | 类型 | 用途 |
| --- | --- | --- |
| `ASSETS` | Workers Assets | 提供 `dist/client` |
| `IMAGES` | Cloudflare Images | 图片格式与尺寸转换 |
| `SHORT_LINKS` | D1 | 保存短链接 |
| `LINK_LIMITER` | Rate Limiting | 限制短链接创建频率 |

Fork 后创建自己的 D1 数据库，并将 Wrangler 输出的 ID 写入你自己的配置：

```bash
npx wrangler d1 create web-toolbox-links
npx wrangler d1 migrations apply web-toolbox-links --local
npx wrangler d1 migrations apply web-toolbox-links --remote
```

随后修改 `wrangler.jsonc` 中的 Worker 名称、路由、Zone、数据库名称与 `database_id`。

## 构建与验证

```bash
npm run check
npx wrangler deploy --dry-run
```

确认构建、测试、入口文件和全部绑定有效后再发布：

```bash
npx wrangler deploy --keep-vars
```

`--keep-vars` 会保留通过 Cloudflare Dashboard 管理的变量；机密信息应通过 Secret 管理。

## Bilibili Worker

该 Worker 的源码和配置位于 `workers/eason-bilibili-api/`：

```bash
npx wrangler deploy --config workers/eason-bilibili-api/wrangler.jsonc --dry-run
npx wrangler deploy --config workers/eason-bilibili-api/wrangler.jsonc
```

Fork 后请先修改 Worker 名称与 `routes`。健康检查路径为 `/health`。

## Douyin 与 Kuaishou Workers

生产站点还使用以下独立 Cloudflare Workers：

- `eason-daoyin-api` → `douyin-api.easonzhan.xyz`
- `eason-kuaishou-api` → `kuaishou-api.easonzhan.xyz`

它们当前作为外部部署依赖记录，源码不在本仓库中。抖音服务直接访问抖音公开页面和播放地址；快手服务会优先调用 `api.bugpk.com` 与 `api.qster.top`，失败后回退到快手公开页面。Fork 如需完全独立部署，应实现与页面当前请求/响应结构兼容的服务，并替换相应页面中的 API 前缀；密钥必须使用 Worker Secret，不得写入源码或配置。

## 发布后检查

1. 首页、设置、搜索、分类和收藏功能正常；
2. 本地媒体工具能处理代表性样本；
3. `/robots.txt`、`/sitemap.xml` 与 `/rss.xml` 可访问；
4. `/api/short-links` 能创建短链，`/s/{code}` 能跳转；
5. 三个视频解析端点均返回可预期的成功或结构化错误；
6. Cloudflare Logs 中无持续异常，D1 与限流绑定正常。
