# 项目审查 · 2026-11-11

审查基线：`a9b9e8a`，127 个工具、716 个跟踪文件，其中 634 个 JS / TS 文件。完成全仓清单、源码引用扫描、依赖审计和路由一致性检查；重点阅读服务端入口、共享任务生命周期、文件与文档处理、主题和首页状态管理。生成声明与第三方运行库按产物检查，不作为手写代码逐行评审。

以下是本轮有证据的发现。自动检查与重点代码审查不能证明每个工具在所有浏览器、输入和线上环境中都正确。

## 已修复

| 优先级 | 文件 | 问题与影响 | 修改与理由 |
| --- | --- | --- | --- |
| 高 | `package.json`、`package-lock.json`、`tests/dependency-security.test.mjs` | RSC 19.2.8 命中 Critical 公告 GHSA-xqc2-xf4c-x3h3。本项目使用 RSC 服务端构建，不能因它列在 devDependencies 就忽略。 | React、React DOM、RSC 同步升级至补丁 19.2.9，增加版本下限回归。审计由 1 项 Critical 降至 0；未验证漏洞利用，也不推断线上已遭攻击。 |
| 中 | `app/layout.tsx` | 分享元数据直接拼接请求头的 host / protocol，可产生错误域名；无效 host 会让 URL 构造抛错。 | 只读取项目 `homepage`，隔离请求头。具名导入避免整份包配置进入产物，并补充部署说明。 |
| 中 | `worker/short-links.ts`、`app/components/short-link-generator.tsx`、`app/lib/short-links.ts` | 生成地址和结果校验都写死生产域名，Fork 或本地运行会返回不属于当前数据库的链接。 | 使用当前请求/页面 origin，验证完整 URL 与路径，拒绝跨域结果和嵌套本站短链接。数据库测试覆盖自定义域名、本地端口和跳转。 |
| 中 | `app/lib/timestamp-tools.ts` | 浮点乘法导致合法输入 `1.001`、`-1.001` 秒被拒绝；大数的非零亚毫秒部分又可能被舍入后接受。 | 拆开整数秒与小数，按整数毫秒计算；毫秒输入显式拒绝非零小数。覆盖正负数、上限与亚毫秒。 |
| 中 | `app/lib/date-calculator.ts` | 工作日逐天循环，长跨度阻塞主线程；年份 0–99 被 Date 当作 1900–1999，午夜夏令时跳变还可能漏掉末日。 | 按日历天数计算整周，最多检查余下 6 天。覆盖倒序、包含末日、闰年、多时区、午夜夏令时和年份 0001。 |
| 低 | 删除 `app/chatgpt-auth.ts` | 86 行旧登录模板无源码引用，依赖本站不存在的登录回调路径。 | 删除无引用模板，减少对项目认证能力的误解；实际使用的声明与兼容代码保留。 |

安全补丁依据：[React 官方公告](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3)。

## 性能对照

同机、Node 24.15.0、Asia/Shanghai，计算 2000-01-01 至 9999-12-31（包含末日）。每版预热 1 次、测量 5 次，结果均为 2,087,100 个工作日。

| 实现 | 中位耗时 | 计算次数 |
| --- | ---: | --- |
| 原逐日循环 | 663.403 ms | 约 292 万次日期递增 |
| 按整周计算 | 0.012 ms | 最多 6 次余数检查 |

这是函数微基准，不代表网页首屏、网络或低端手机的实测速度。原始样本：本地 `outputs/audit-date-benchmark-20261111.json`。

## 后续处理

- 删除旧 YouTube Worker 分支、专用模块、URL 解析辅助、依赖与许可证条目；原 `/api/youtube` 路径改由正常路由返回 404。
- `app/globals.css` 从 9,493 行改为有序导入入口，拆出 7 个样式文件。纯拆分阶段构建 CSS 不变；随后为世界时钟增加两条宽度约束，修复加载完整时区列表后的手机溢出。
- 新增 Playwright 桌面 Chromium、移动 Chromium、移动 WebKit 项目，CI 安装浏览器、运行测试并在失败时保留报告。
- `npm start` 改用 Wrangler 本地 Worker；升级 Wrangler / 本地运行时以支持原兼容日期，生产配置日期不变。
- 浏览器检查发现并修复首页搜索、文件选择、编辑器与正则输入在客户端事件就绪前丢失操作的问题。涉及 `tool-search-grid.tsx`、`file-drop-zone.tsx`、`plain-text-editor.tsx`、`regex-tester.tsx` 与共享 `client-ready.ts`。
- 日期计算器不再在模块加载时读取日期；由服务端每次请求生成默认日期并传入客户端，避免 Worker 与浏览器日期不一致产生 React 接管错误。

后续验证结果：

- lint、类型检查、生产构建通过。单元与结构测试在默认上限 4 进程下 947/947 通过；原 8 项 YouTube 专用测试随旧功能移除，接口撤销由浏览器请求测试覆盖。
- 39 个浏览器用例完成验证：全量运行先通过 38 项，剩余手机检查因误选 Markdown 预览标题而失败，改为只选页面页头后复测通过。每个浏览器环境均完成 127 个工具的脚本错误、标题和页面横向溢出检查。
- 随后为截图增加等待动画完成与预览图片加载的断言，相关 6 项桌面/手机视觉流程再次通过，检查了截图。
- 首次全量检查与浏览器并行运行时，一项原有 PDF 字体测试触及 30 秒超时；降低测试进程并发后全量通过，未放宽测试断言或超时时限。
- 当前单个合并 CSS 为 268,750 字节、gzip 40,001 字节；与纯拆分阶段相比只增加世界时钟宽度约束。
- 已接入 CI，远端运行结果以对应提交的工作流为准。手机验证使用真实浏览器引擎和触摸/视口模拟，未使用实体手机。

## 原始待审查记录

后续按维护者决定，旧 YouTube API 已删除，CSS 已完成第一批拆分，真实浏览器回归已接入 CI。下表保留首次审查依据；当前待确认项仅为短链接保留周期和线上解析限流策略。浏览器测试与拆分说明见 [回归文档](browser-tests.md)。

| 优先级 | 文件 / 证据 | 影响 | 建议与待确认项 |
| --- | --- | --- | --- |
| 高 | `worker/index.ts:4`、`worker/youtube-api.ts:58`、`tests/youtube-api.test.mjs` | 首页没有 YouTube 工具，但 `/api/youtube` 仍公开路由并静态导入解析库。失败时最多串行尝试 6 客户端 × 2 轮；本层没有统一取消/总时限，媒体 fetch 跟随跳转后才检查目标域名。测试主要检查源码字符串。 | 确认是否有外部调用者。无调用者可移除路由、库和测试；保留则应增加请求预算、逐跳地址校验、取消传播及请求回归。未擅自撤销公开接口。 |
| 中 | `worker/short-links.ts:46`、`migrations/short-links/0001_links.sql` | 过期记录返回 410，但没有定时清理或过期索引，数据库持续保留目标网址。未读取线上数据库，现有体积未知。 | 确认过期后保留多久、是否保留统计，再添加分批清理和索引。涉及真实数据删除，未自动实施。 |
| 中 | `workers/shared/video-cache.js:56`、两个解析 Worker 的 `wrangler.jsonc` | 缓存限制的是单 isolate 并发，仓库配置中没有按调用者的限流绑定；抖音回退还消耗 Browser Rendering。不能据此断言控制台没有 WAF 或限流规则。 | 检查线上调用量、额度和控制台规则后再定阈值。当前缓存策略保留。 |
| 中 | `app/globals.css`、`app/layout.tsx`、`app/styles/` | 主样式 9,493 行、266,631 字节，所有工具共用根布局 CSS。构建后合并 CSS 268,645 字节，gzip 39,980 字节；有维护与首屏解析成本，尚未证明是实际 LCP 瓶颈。 | 分批拆出工具专属样式，保留主题和公共规则；每批验收桌面、手机、触摸动画与深色模式。 |
| 中 | `tests/mobile-layout.test.mjs`、`tests/mobile-route-render.test.mjs`、`tests/helpers/client-hook-harness.mjs` | CSS 规则、SSR 和模拟 Hook 测试不能替代真实浏览器排版、WebCodecs、麦克风和 WebGL 验收。 | 增加桌面/手机端到端流程，优先收藏、设置返回、导入取消、导出及权限拒绝，辅以真实设备验证。 |

## 首轮验证与范围

- 修改前：`npm run check` 通过，950 项测试。
- 修改后：`npm run check` 通过，lint、类型检查、生产构建与全部 955 项测试通过。新增 5 项回归覆盖小数秒、日历工作日、多域名短链接及元数据隔离。
- `npm audit`：0 项已知漏洞；仅 React 三个包发生版本变更。
- `npm ci --dry-run --ignore-scripts` 通过，不等于在全新 Linux 环境重新安装并执行 CI。
- `wrangler deploy --dry-run` 完成，识别 D1、Images、Rate Limit 与 Assets 绑定；Worker gzip 6,251.71 KiB，静态资源 636 个。此检查不验证线上绑定可用性或账号配额，也未发布。
- `git diff --check` 通过。
- 127 个工具的桌面/手机 UA 页面结构由 SSR 测试覆盖，不等于真实视口截图验收。
- 未实测线上视频解析成功率、第三方 API 延迟、真实设备权限及低内存行为。
- 上述为首轮验证数据，后续部署状态以 GitHub 提交、CI 和实际站点为准。

完整检查：本地 `outputs/audit-20261111-check-final.log`；依赖审计：`outputs/audit-20261111-dependencies-after.json`；部署包检查：`outputs/audit-20261111-deploy-dry-run.log`。
