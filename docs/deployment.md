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

## 视频解析 Workers

三个 Worker 的源码和配置均位于 `workers/`。抖音 Worker 需要 Cloudflare Browser Rendering 绑定；快手 Worker 只读取快手公开页面和认可的媒体 CDN，不使用第三方解析服务。

```bash
npx wrangler deploy --config workers/eason-daoyin-api/wrangler.jsonc --dry-run
npx wrangler deploy --config workers/eason-bilibili-api/wrangler.jsonc --dry-run
npx wrangler deploy --config workers/eason-kuaishou-api/wrangler.jsonc --dry-run

npx wrangler deploy --config workers/eason-daoyin-api/wrangler.jsonc
npx wrangler deploy --config workers/eason-bilibili-api/wrangler.jsonc
npx wrangler deploy --config workers/eason-kuaishou-api/wrangler.jsonc
```

Fork 后请先修改 Worker 名称与 `routes`。三个 Worker 的健康检查路径均为 `/health`，无需第三方解析服务密钥。

## 发布后检查

1. 首页、设置、搜索、分类和收藏功能正常；
2. 本地媒体工具能处理代表性样本；
3. `/robots.txt`、`/sitemap.xml` 与 `/rss.xml` 可访问；
4. `/api/short-links` 能创建短链，`/s/{code}` 能跳转；
5. 三个视频解析端点均返回可预期的成功或结构化错误；
6. Cloudflare Logs 中无持续异常，D1 与限流绑定正常。
