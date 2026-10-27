# 依赖与上游审查

## 第八批增量（2026-10-27）

精确锁定 jsonpointer 5.0.1 与 bezier-easing 3.2.0，均为 MIT、无运行时依赖，原始许可证随构建分发并有一致性测试。摘要使用原生 Web Crypto，未加入额外密码算法包；路径仅开放只读 getter，并额外限制自有字段、数组索引、数据预算与 Worker 时限。实际直接依赖现为 88 项，`npm audit --audit-level=low` 为 0 项已知漏洞。完整范围见 [选型记录](json-digest-easing-tools.md)；以下各日期的历史快照保留原记录，不能视为本次数量或安全保证。

最近审查：2026-10-26。下方按日期记录审查快照。

## 第四批本地工具（2026-10-23）

新增精确锁定的 yaml 2.9.1（ISC，无运行时依赖），原始许可证由构建脚本复制分发。PDF 导出继续复用既有 PDF.js，ZIP 继续使用 fflate；图片固定网格及小型 HEX / sRGB 对比度规则独立实现，不引入另一套裁剪或颜色引擎。安装时 npm 审计为 0 项已知漏洞；最终检查与局限见 [实用工具选型](pc-tool-research.md)。

## 第三批文本与文档工具（2026-10-23）

锁定 pinyin-pro 3.29.5（MIT）和 entities 8.1.0（BSD-2-Clause）；后者原先已存在于间接依赖，本次显式声明实际使用的版本。两个包均无运行时依赖。CSV / TSV 继续使用既有 Papa Parse，图片合成 PDF 继续使用既有 pdf-lib，不另加表格或 PDF 引擎。新增两个包及 Papa Parse 原始许可证由构建脚本复制。安装后 `npm audit --audit-level=low` 通过，0 项已知漏洞；这只是当前审计快照，不代表不存在未知漏洞。具体能力和限制见 [实用工具选型](pc-tool-research.md)。

## 第二批工具与新增公告复核（2026-10-23）

第二批单位换算、图片调色、DPI 修改和视频取帧复用既有依赖，没有新增 npm 包。

复核时 `npm audit --audit-level=low` 对原有 DOMPurify 3.4.16 与 Next.js 16.3.8 报告两个 Critical 依赖组，涉及 10 月 22 日更新的公告。按上游修复范围升级为 DOMPurify 3.4.17 与 Next.js 16.4.2，同步 Next.js 自带 env / SWC 包，并提高安全回归的版本下限；未使用 `--force`、漏洞忽略或降低审计阈值。安装及再次审计通过，0 项已知漏洞。React / React DOM / RSC 版本保持一致，仍为 19.2.8。

来源：[DOMPurify 模板安全公告](https://github.com/advisories/GHSA-cg2g-xh64-v4q7)、[Next.js 图像优化公告](https://github.com/advisories/GHSA-2464-fhr4-w9xw)、[缓存类型数组公告](https://github.com/advisories/GHSA-673q-mjm6-r5xr)、[Server Actions 公告](https://github.com/advisories/GHSA-p3m5-59mp-jv5r)。这些是依赖版本匹配结果，并非已证明本站在线运行方式存在可利用路径；本站使用 vinext，既有 sharp override 已为 0.35.5。本次更新用于消除已知依赖告警并继续满足 CI 审计。

升级后的 ESLint、TypeScript、生产构建、85 条页面路径与全站 390 项测试均通过，`npm audit --audit-level=low` 再次通过。具体验证边界见 [实用工具调研](pc-tool-research.md)。已按后续用户请求于 2026-10-23 部署主站，版本 ID 为 `e8efe0a6-e189-4d76-a20c-0b496ac8357d`；未提交或推送 GitHub。

## 实用工具依赖补充（2026-10-22）

新增 JsBarcode 3.12.3 和 jwt-decode 4.0.0，均为 MIT、无运行时依赖，确切版本记录在锁文件中；原始许可证随构建分发。`npm audit --audit-level=low` 通过，0 项已知漏洞。其余依赖版本未变；功能选型、验证和局限见 [实用工具调研](pc-tool-research.md)。

## 全站优化安全补丁（2026-10-22）

`npm audit` 确认 Vite 8.1.5 出现开发服务器及 Windows 编辑器启动相关告警。升级同分支修复版 8.1.6 并同步依赖锁，没有改动其他依赖版本、审计阈值或部署方式。`npm audit --audit-level=low` 重新通过，0 项已知告警；回归测试增加 Vite 修复版本下限。

影响范围和验证限制见 [本轮优化记录](optimization-2026-10-22.md)。这不表示线上已遭利用，也不意味着不存在未知漏洞。

## 新增工具与完整依赖审计（2026-10-13）

- 新增九项运行时依赖，分别用于 PDF 页面、文本差异、ZIP、OCR、JSON、Markdown、EXIF、字幕和时区；中英文 OCR 模型作为两项构建期依赖，锁定版本、来源与许可证见 [调研记录](extended-tools-research.md) 和 [第三方声明](../THIRD_PARTY_NOTICES.md)。当前直接运行时依赖 48 个、开发依赖 24 个。
- `npm audit --audit-level=low` 与 `npm audit --omit=dev --audit-level=low` 均通过，全部依赖 0 个已知漏洞；依赖锁可通过 `npm ci --dry-run --ignore-scripts` 校验。
- OCR 引擎和模型自托管，模型压缩载荷使用 `.traineddata` URL，避免 `.gz` 被静态服务器当作 HTTP 预压缩附属文件。模型内容与上游发布包一致，随构建附带来源说明及许可证。
- ZIP 先检查路径、条目数、解压体积、压缩比和加密标记，再执行提取和 CRC32 校验。Markdown 输出经 DOMPurify 净化，不允许脚本、嵌入或能加载外部资源的样式属性。
- 文件、贴图和音频采样处理使用独立 Worker；长任务支持取消和超时，不将上传文件送往第三方解析服务。移除“其他服务”分类及网易云音乐第三方入口，不修改已有视频 API Worker。
- `npm run check` 通过：Lint、类型检查、生产构建及 266 项测试。主站 `wrangler deploy --dry-run` 通过；单个浏览器静态资源均不超过 Cloudflare 25 MiB 限制。

本节记录发布前的检查结果，构建与 dry-run 本身不等于已部署或已推送 GitHub。当前主站打包 gzip 约 5.01 MiB；远程上传是否成功需以实际部署结果为准。零已知漏洞是审计快照，不等于不存在未知风险。

## 完整依赖审计快照（2026-10-09）

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

2026-10-26 第七批依赖增量：`@pdf-lib/fontkit` 1.1.1（上游 README 与元数据声明 MIT）用于 PDF 中文页码字体子集，`saxes` 6.0.0（ISC）用于有深度、节点和单文件预算的命名空间 XML 解析。其依赖 pako 1.0.11 与 xmlchars 2.2.0 的原始许可随构建分发。其余四项复用现有工具库或平台 API，无新增编辑器框架，也没有从 ToolKnit 复制受限制的源码。

两项发布包都未附独立 LICENSE：saxes 从 v6.0.0 标签取回原始全文；fontkit 的上游仓库也未找到独立全文，因此保留其明确链接 MIT 的原始 README、包元数据、原始 ES 文件内的第三方声明与本项目的来源说明，不补造上游版权日期。不能把 npm 的 MIT 字段当作对内嵌依赖的重新授权；Google Brotli 的 Apache-2.0 与 pako 声明继续保留。该记录并非法律意见，后续依赖升级仍需复核原始归属。

saxes 仓库已归档，选用其成熟的严格 SAX / 命名空间行为而不自动解引用实体；输入不使用远程资源、DOM 或 XML 样式转换。测试覆盖 DTD / XXE、异常编码、节点与深度、ZIP 路径 / CRC、关系顺序、取消等。未将“审计无已知漏洞”当作安全或维护状态保证。

2026-10-26 增量复核：新增直接依赖 ipaddr.js 2.5.0、culori 4.0.2（均 MIT，无运行时子依赖），开发类型 @types/culori 4.0.1。ipaddr.js 原先已作为间接依赖存在，现显式声明与锁定。Nzh 1.0.14 调研时发现发布包缺少完整许可正文，已排除，不留在依赖锁。URL 使用平台原生 API，阴影独立生成，无额外解析/渲染库。

本次 npm 审计新增报告来自既有工具链的 fast-uri / undici / zod，不是上述两项新库。仅升级到 fast-uri 3.1.9、undici 7.30.1、zod 4.6.6，并更新所有锁定实例的最低安全版本测试；没有执行 `npm audit fix --force` 或采用审计建议的 Cloudflare 大幅降级。修复依据：[fast-uri 公告](https://github.com/advisories/GHSA-w74x-v6f9-j3xg)、[undici 公告](https://github.com/advisories/GHSA-4qv8-2p9j-2685)、[zod 公告](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)。补丁安装后的 `npm audit --audit-level=low` 返回 0 项已知漏洞；历史审查记录保留当时版本，不覆盖历史事实。

2026-10-23 第五批工具的依赖增量：cron-parser 5.10.2（MIT）、file-type 22.2.0（MIT）、pixelmatch 8.0.0（ISC），均为精确版本；视频裁剪复用既有 Mediabunny，不新增媒体引擎。前两者带入 Luxon 和文件头 tokenizer 的宽松许可依赖，构建脚本分发相应原始许可；@tokenizer/token 仅含类型声明，pngjs 属于未打包的 Pixelmatch CLI。file-type 使用浏览器入口，不引入文件系统访问；本工具只提供 64 KiB 样本，并单独处理 ZIP/GZIP 容器，避免为了确认内部格式解压不可信内容。三项引擎只在对应 Worker 任务中动态加载，视频引擎仅在导入/导出时加载。

```bash
npm ci
npm audit --audit-level=low
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy --config workers/eason-daoyin-api/wrangler.jsonc --dry-run
npx wrangler deploy --config workers/eason-bilibili-api/wrangler.jsonc --dry-run
```

发布前还应确认：工作区干净、没有未跟踪的私密文件、CI 通过，并以 `git diff --check` 检查空白错误。
