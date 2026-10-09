# 依赖与上游审查

最近审查：2026-10-09。下方补丁阶段与 2026-09-22 内容为历史快照。

## 当前完整依赖审计（2026-10-09）

`npm audit --audit-level=low` 与 `npm audit --omit=dev --audit-level=low` 均通过：生产及开发依赖合计 **0 个已知漏洞**。没有使用漏洞忽略列表、审计阈值下调、虚构修复版本或 `npm audit fix --force`。

在下方安全补丁基础上，移除尚无修复版本的旧依赖链：

| 原依赖链 | 处理方式 | 兼容验证 |
| --- | --- | --- |
| Transformers.js 3 → ONNX Runtime Node → global-agent 3 → roarr → sprintf-js | 保留 [Transformers.js](https://github.com/huggingface/transformers.js) 3.8.1 的浏览器引擎与模型；定向 override Node 安装依赖 `onnxruntime-node` 为 1.30.0，采用 global-agent 4 并移除旧格式化链 | 实际 Node 后端 Tensor 创建、类型检查、构建产物隔离、浏览器智能抠图回归 |
| Mammoth → argparse 1 → sprintf-js | Mammoth 依赖锁升级至 1.13.0，定向 override argparse 2.0.1；该版本保留上游 CLI 使用的旧 API | 实际 CLI 帮助、中文 DOCX 转 HTML / Markdown、浏览器 DOCX 转换 |
| Cloudflare Puppeteer → @puppeteer/browsers 2 → extract-zip / proxy-agent → basic-ftp | 仅将浏览器管理模块 override 为 3.2.4，移除旧下载与代理链；保留 Cloudflare 远程浏览器 API | 实际模块与 Node 辅助入口加载、抖音 Worker 打包 |
| ESLint / vinext → fast-glob → micromatch → braces | 使用 [tinyglobby](https://github.com/SuperchupuDev/tinyglobby) 0.2.17 加本仓库 `packages/glob-compat` 兼容层，替换实际路径匹配实现 | 目录、扩展名、否定模式、隐藏文件、同步/异步结果、深嵌套限制、Lint 与构建 |

兼容层只覆盖当前 ESLint 与 Vite 插件使用的 API；未知选项明确抛错，不声称完全替代 fast-glob。升级构建工具时需重新核对调用范围。argparse 2 对 Mammoth 的旧命名 API 保留兼容但会发出弃用提示，不能未经验证升到移除这些 API 的 argparse 3。

当前直接运行时依赖 39 个、开发依赖 22 个。`tests/dependency-security.test.mjs` 检查修复版本下限、旧依赖链是否真实移除，以及实际模块兼容性；CI 已改为对**全部依赖、全部告警等级**执行审计。零已知告警是本次审计快照，不等于保证不存在未知漏洞。

发布检查曾发现 Transformers.js 4.3.1 的一项 WASM 资源达到 25.6 MiB，超过 Cloudflare Workers 的单资源 25 MiB 上限。最终没有采用该浏览器引擎升级，而是仅迁移 Node 安装依赖；不增加 CDN、伪造资源大小或删掉运行时必要资源。回归测试会检查实际 `dist/client` 中每个文件的大小，防止后续构建再次超限。

最终验证：`npm run check` 通过（Lint、类型检查、生产构建、249 项测试）；主站与两个视频 Worker 的 `wrangler deploy --dry-run` 均通过。浏览器实测智能抠图完成并下载带透明通道的 PNG，中文 Word → PDF 预览与下载、PDF → 可编辑 Word 均正常；下载后重新提取 Word 正文确认中文回转内容。测试使用项目公开标志和生成的非私密文档，未上传用户私密文件。

`--dry-run` 只验证本地部署打包，不等于已部署，也不验证账户套餐额度。主站本次打包 gzip 合计约 4.53 MiB，部署时需确认账户允许相应 Worker 脚本大小；不要把“本地检查通过”视为 Cloudflare 远程上传成功。

## 补丁阶段快照（2026-10-09，后续告警已由上方迁移关闭）

本次按实际依赖链升级补丁版本，未修改页面、工具功能或 Git 历史，也未使用 `npm audit fix --force`、漏洞忽略列表或降级旧版依赖来隐藏告警。

| 依赖 | 原版本 | 修复版本 |
| --- | --- | --- |
| Next.js | 16.3.4 | 16.3.8 |
| DOMPurify | 3.4.14 | 3.4.16 |
| sharp（已有 override） | 0.35.4 | 0.35.5 |
| source-map-js（依赖锁） | 1.2.1 | 1.2.2 |
| fast-uri（已有 override） | 3.1.6 | 3.1.8 |
| undici（已有 override） | 7.29.0 | 7.29.1 |

审计结果：

- `npm audit --omit=dev --audit-level=high` 通过：生产依赖 **0 严重、0 高危、0 低危**；仍有 **7 项中危**依赖链告警。
- 包含开发依赖的 `npm audit` 仍失败：**7 中危、15 高危**。生产高危门禁通过，不等于所有依赖零漏洞。
- 当前直接运行时依赖 39 个、开发依赖 21 个。依赖锁与清单已同步，CI 原有高危审计门禁保持不变。
- 回归中另外发现 PDF 生成工作线程被框架错误折叠为有 `window` 的环境。已在 `vite.config.ts` 中仅对 PDF 工作线程的运行环境探测做修正，不更改主页面环境；新增无 `window` 初始化测试。浏览器实测中文 DOCX → PDF 预览和下载、PDF → 可编辑 Word 均完成。

### 当时尚未关闭的告警

生产依赖的 7 项中危均来自 [sprintf-js 精度格式拒绝服务告警](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)，上游尚无修复版。两条链分别是：

- `mammoth → argparse → sprintf-js`：`argparse` 仅由 Mammoth CLI 使用。网站只导入 `mammoth/mammoth.browser`，不执行该 CLI；中文 DOCX 实际读取与正文 HTML 转义已加入回归测试。
- `@huggingface/transformers → onnxruntime-node → global-agent → roarr → sprintf-js`：代理链由 Node 安装脚本使用。网站使用浏览器抠图后端，不接受或执行用户提供的格式字符串。

`tests/dependency-security.test.mjs` 会检查已修复版本下限，并扫描真实浏览器与服务器构建产物，阻止上述 CLI、Node 安装脚本和格式化依赖链进入部署产物。该检查只证明当前部署路径的隔离，不会取消 npm 告警，也不代表依赖包本身已经修复。

开发依赖高危来自 `braces` 的 glob 解析链和 `extract-zip`、`basic-ftp` 的浏览器下载/代理链，影响 ESLint、vinext 和 Cloudflare Puppeteer 的开发工具依赖。当前 `braces`、`extract-zip` 尚无安全发布版本；`basic-ftp` 的修复需要跨主版本替换旧依赖链。没有盲目执行 npm 建议的旧版框架、旧版 Puppeteer 或旧版 Mammoth 降级。

此阶段之后已完成上方依赖迁移，旧链不再保留。仍应跟踪上游更新，不将开发服务器暴露到公网，并对后续依赖升级重新运行完整审计和回归。

## 科学计算工具增补（2026-10-09）

- 新增 MathLive `0.111.0` 与 Cortex Compute Engine `0.151.0`，两者为 MIT；继续使用已有的 Math.js（Apache-2.0）。许可证已登记，数学字体在构建时复制为同源资源，不依赖 CDN。
- 六个科学计算工具均在浏览器 Web Worker 内计算，不请求解析上游，也不上传公式和统计数据；加入输入长度、运算范围、取消和超时限制。
- 新增数学库未出现在本次审计告警中；安全状态以本文件最上方的最新审查为准。

## 历史审查（2026-09-22）

以下结论与依赖数量保留用于追溯，不代表当前安全状态。

### 结论

当前仓库具备公开发布到 GitHub 的基础条件：许可证、社区文件、持续集成、依赖锁、自动更新、安全报告渠道、部署说明和第三方声明均已提供；仓库内容扫描未发现 API Token、`.env`、用户文件或 Windows 本地绝对路径。

主站及两个视频解析 Worker 的源码与配置均已收录。抖音 Worker 只读取平台公开页面、官方播放器或认可的媒体 CDN，不依赖第三方解析服务，因此 Fork 可以完整自托管。

### npm 依赖

- 直接运行时依赖：37 个。
- 直接开发依赖：21 个。
- `npm audit --omit=dev`：生产依赖 0 个已知漏洞。Browser Rendering 的开发期打包依赖当前仍会触发 `extract-zip` 高危审计告警，但该包不会进入主站运行时，也不处理用户上传的压缩包；等待 `@cloudflare/puppeteer` 上游升级传递依赖。
- `package-lock.json` 已提交；GitHub Dependabot 每周检查 npm 依赖、每月检查 Actions。

主要许可证为 MIT、ISC、Apache-2.0、MPL-2.0、BSD-2-Clause 与 BSD-3-Clause。需特别留意：

- `mediabunny`、`@mediabunny/mp3-encoder` 与 `@soundtouchjs/audio-worklet` 使用 MPL-2.0；
- `@cloudflare/puppeteer` 使用 Apache-2.0，仅用于抖音 Worker 的 Cloudflare Browser Rendering；
- `sharp` 的可选平台包包含 LGPL-3.0-or-later 的 `libvips` 二进制；
- `caniuse-lite` 使用 CC-BY-4.0；
- `jszip` 提供 MIT 或 GPL-3.0-or-later 双许可，本项目按 MIT 使用；
- `png-js` 的 `package.json` 未填写许可证字段，但发布包内附带 MIT License。

锁定版本并非全部为上游最新版本。为避免未经验证的媒体编解码、React、Next.js 和构建链升级改变现有功能，本次没有批量升级；后续应通过 Dependabot 分批更新，并对每批更新运行 `npm run check`。

## 两个视频 API

本次通过 Cloudflare 已部署 Worker 的版本元数据和脚本内容核对实际请求目标：

| API | 真实 Worker | 数据来源 | 可复现性 |
| --- | --- | --- | --- |
| 抖音 | `eason-daoyin-api` | 直接使用抖音公开页面、官方播放器与媒体地址；通过 Cloudflare Browser Rendering 获取页面信息 | 源码与 Wrangler 配置已收录，可独立部署 |
| Bilibili | `eason-bilibili-api` | 直接使用 `api.bilibili.com` 的公开播放接口，并限制代理到认可的媒体 CDN | 源码与 Wrangler 配置已收录，可独立部署 |

两个站点页面目前分别请求：

- `https://douyin-api.easonzhan.xyz/?url=`
- `https://bilibili-api.easonzhan.xyz/?url=`

这些域名属于当前生产部署，不构成对第三方 Fork 的长期服务承诺。平台页面与接口可能改变响应、限流或停止服务；使用者应自行评估条款、内容授权、隐私和当地法律。

## Cloudflare 配置

- 主站与两个视频 Worker 均设置了明确的 `compatibility_date`、生产路由和日志可观测性。
- 主站绑定 Assets、Images、D1 与 Rate Limiting；抖音 Worker 绑定 Browser Rendering，其他视频 Worker 不依赖秘密绑定。
- Cloudflare 资源 ID 不是密钥，但 Fork 不应复用生产资源，部署前必须替换 `wrangler.jsonc` 中的名称、域名和绑定。
- 后续新增 Worker 密钥时必须使用 Cloudflare Worker Secret，不得硬编码或提交到仓库。

## 发布检查清单

```bash
npm ci
npm audit --audit-level=low
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy --config workers/eason-daoyin-api/wrangler.jsonc --dry-run
npx wrangler deploy --config workers/eason-bilibili-api/wrangler.jsonc --dry-run
```

发布前还应确认：工作区干净、没有未跟踪的私密文件、CI 通过，并以 `git diff --check` 检查空白错误。
