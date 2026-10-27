# ToolKnit 工程思路借鉴与优化

本轮保留多功能工具箱的功能、页面风格、路径、MIT 许可证和 Cloudflare 部署方式，不新增工具、运行时依赖或桌面程序，不自动部署、提交、推送或更新版本。

## 参考范围

2026-10-26 继续阅读 [ToolKnit Desktop](https://github.com/ZihangDong/toolknit-desktop) 的工程材料：

- [维护指南](https://github.com/ZihangDong/toolknit-desktop/blob/main/toolknit-desktop/docs/V3_MAINTENANCE_GUIDE.zh-CN.md)：文档解析与绘制分离、完成后替换预览、取消与清理。
- [依赖锁检查入口](https://github.com/ZihangDong/toolknit-desktop/blob/main/toolknit-desktop/scripts/check-dependency-lock.mjs)：检查实际安装元数据，而非仅相信安装清单。
- [工具目录检查入口](https://github.com/ZihangDong/toolknit-desktop/blob/main/toolknit-desktop/scripts/sync-cli-catalog.mjs)：目录唯一性、注册与发布内容一致。
- [NOTICE](https://github.com/ZihangDong/toolknit-desktop/blob/main/NOTICE)：不能把公开可读视为可自由集成。

只借鉴通用工程思路，按本项目 React / PDF.js / Web Worker 架构独立实现，不复制源码、素材或界面。按用户要求排除受限 PDF-to-Word 引擎；已有独立文档转换功能不删除，项目授权不改变。

## 已证实的问题与修改

| 文件 | 修改前的具体影响 | 修改与理由 |
| --- | --- | --- |
| `app/components/pdf-local-preview.tsx` | 页码 / 裁切工具的 effect 依赖文件和页码，每次切页都重新 `loadPdf`，随后销毁整个文档；等待新页时旧预览立即消失 | 新增 `app/lib/pdf-preview-session.ts`，按输入文件持有一个解析会话，切页只取消旧绘制；换文件或退出才销毁。下一页完成前保留同一文件的上一幅图，明确标注其页码；旧页不叠加新页裁切框 |
| `app/lib/document-pdf.ts` | 创建画布、取上下文和调用同步 `page.render()` 位于清理用的 `try` 外，失败会跳过清理；获取页面和 PNG 编码之后缺少取消检查 | 将初始化纳入 `try/finally`，各异步边界检查取消，所有已取得页面均清理，已分配画布归零。校验非有限尺寸和比例，预览另加最长边 8192px 保护，不改变原文件或导出尺寸 |
| `app/lib/file-worker-client.ts` | 未监听 `messageerror`，消息无法反序列化时只能等待原有 15 分钟超时；空消息可误报成功，进度接收回调异常会逃出事件处理器；迟到回调可重复清理 | 对消息信封及进度做校验，反序列化失败立即报错；成功、错误、取消、超时统一为只执行一次的终止流程，注销处理器、清计时器并结束 Worker；发送前重查取消 |

先在旧实现上运行 `tests/runtime-hardening.test.mjs` 最初的 8 个用例，8 项均失败，分别覆盖消息传输、回调异常、空消息、迟到回调、初始化取消、绘制同步异常、PNG 编码取消和读取页面时取消；修改后通过。后续又增加了非法尺寸与极端长宽比回归。这些是受控故障复现，不表示所有用户都会遇到相同错误。

## 预防性工程检查

新增 `scripts/project-integrity.mjs`、`scripts/check-project-integrity.mjs` 与 `npm run check:integrity`，通过 `prebuild` 在现有 `npm run build` 前自动运行：

- 比较项目声明、锁文件和 **86 项直接依赖实际安装的 package.json**，包括名称不同的本地 npm 链接及真实链接目标；不修改依赖、不自动安装或修复。
- 用 TypeScript AST 读取现有工具 / 分类字面量，不导入或执行界面模块，不移动注册表，不更改排序。
- 检查工具名称、标题、路径唯一性、分类、页面是否存在；与 sitemap 的规范同源 URL 对照。保留 `/calculator` 旧重定向，不作为重复工具公开。
- XML 采用现有 saxes，拒绝 DTD、错误嵌套、异站与重复地址；不读取外部实体。

检查前实际依赖版本与锁文件已一致，工具和 sitemap 也一致，**没有发现版本漂移或缺失路由**。这是后续防止误发布的保护，不把它描述成修复了现存错误。检查不覆盖所有间接依赖的文件内容、不校验包签名，不能替代 `npm ci`、安全审查和测试。

## 可比数据与验证

`tests/pdf-preview-real.test.mjs` 使用同一份真实三页 PDF，前后均调用相同 `renderPdfPage`，用真实 PDF.js + Node Canvas 输出 PNG；区别只在文档每页加载还是会话复用：

| 指标 | 原逐页加载流程 | 新会话流程 |
| --- | --- | --- |
| 连续查看 3 页的文档解析次数 | 3 | 1 |
| 文档销毁次数（含退出） | 3 | 1 |
| 输出 | 三张对应页面 PNG | 三张 PNG 与原流程逐字节一致，尺寸及红 / 绿 / 蓝样本像素正确 |
| 单页画布 | 每页释放 | 每页释放 |

这是解析工作量对照，不是浏览器加载时间、内存峰值或网络测速；不声称全站提速某个百分比。文档会话保留到换文件或退出，不是无限文档 / 全页图片缓存。

专项测试还覆盖快速切页、共享加载中切页、迟到结果、重复退出、导入失败、加载中退出、取消和错误恢复；Hook 测试核对旧页提示、错误状态、裁切框和换文件不露旧图。

2026-10-27 完成验证：

- 初轮新增与相关专项 31 项通过；本轮共新增 21 项测试，并更新原单页预览回归。
- `npm run check` 退出码 0：ESLint、TypeScript、生产构建及全站 **514 项测试通过，0 失败、0 跳过**。完整本地日志为被 Git 忽略的 `outputs/toolknit-optimization-check.log`。
- 构建前一致性检查通过：86 项实际直接依赖、105 个工具、106 条站点地图 URL。旧页面与四种首页布局等既有回归继续通过。
- `npm audit --audit-level=low`：0 项已知漏洞；`git diff --check` 通过。
- 版本仍为 1.1.0；没有部署、提交、推送或修改 Release。

## 仍需验证的部分

- 已保存的浏览器访问权限限制未绕过，本轮没有完成真实桌面 / 手机截图、触控、字体与浏览器兼容验收。Node Canvas 和 Hook 回归不能替代这些检查。
- 未提供真实浏览器首屏、交互延迟或峰值内存对比；既有大分包和字体识别提示仍须按构建及测试日志处理，不调高告警阈值掩盖问题。
- 初轮未修改 `app/components/pdf-page-manager.tsx` 的另一套页面管理预览；下述第一阶段续作已将它接入会话，保留零基页码、0.7 倍缩略比例与旋转布局。其他文档转换 / 导出流程不改成全局 PDF 缓存。
- PDF-to-Word 受限引擎不纳入计划；已有 `@pdf-lib/fontkit` 独立 LICENSE 缺失的上游分发边界见 [第三方声明](../THIRD_PARTY_NOTICES.md)，本次不声称完成法律审计。

## 第一阶段续作：任务生命周期与页面管理预览（2026-10-27）

用户批准开始建议的第 1、2 项。本阶段不新增工具、不改变风格、路由、部署配置、版本或授权，不自动部署与推送，也不引入 ToolKnit 源码。

### 任务线程

新建 `app/lib/worker-task.ts`，把八个由应用直接创建的任务 Worker 的资源归属、消息校验、取消与结束清理收敛到同一实现。各 client 保留静态 `new Worker(new URL(..., import.meta.url))` 工厂，供 Vite 发现与分包；没有把算法、OCR 或文档引擎改为首页同步加载。

| 入口 / 具体文件 | 保留的工作规则 | 本阶段作用 |
| --- | --- | --- |
| 文件：`app/lib/file-worker-client.ts` | 15 分钟、数字进度 | 复用上轮修复的语义，并拒绝同时包含结果 / 错误 / 进度的冲突信封 |
| OCR：`app/lib/ocr-client.ts` | 10 分钟、同源引擎及中英文模型 | 补齐消息反序列化失败、进度回调异常、初始化取消与幂等清理 |
| 图片 / 音频：`app/lib/raster-worker-client.ts` | 15 分钟；图片缓冲转移并去重；音频源缓冲不转移 | 保留传输规则，清理路径不再单独重复；构造传输列表后再查取消，避免继续发送 |
| 科学计算：`app/lib/scientific-client.ts` | 20 秒、取消为 AbortError | 保留终止计算的保护，补齐异常信封、消息传输错误与迟到事件处理 |
| Unity：`app/lib/game-asset-client.ts` | 15 分钟、带 type 的进度 | 保留独立协议与处理引擎，关闭后清空事件处理器，回调异常也结束任务 |
| 正则：`app/lib/regex-worker-client.ts` | 5 秒 | 不在主线程回退执行、不延长危险表达式的处理时间 |
| 文件哈希：新增 `app/lib/file-hash-client.ts`，接入 `app/components/file-hash.tsx` | 流式读取；不新增固定超时、不整文件读取 | 适配 loaded / total、done / error 原协议；校验进度和所选算法摘要，旧任务不覆盖新文件；界面、算法与复制保持 |
| Word 生成：新增 `app/lib/document-pdf-client.ts`，接入 `app/lib/document-word-to-pdf.ts` | 外层组件原有 3 分钟无进展超时，每次进度重置 | 只迁出线程管理，保留 percent / message / blob 协议，不额外叠加固定总时长；不涉及受限 PDF-to-Word 引擎 |

共同结束路径会注销三个事件处理器、移除取消监听、清理可选计时器并终止 Worker，且只执行一次。请求发送前与传输列表生成后均检查取消；旧任务保留的事件回调无权继续报进度或改变结果。消息校验主要是传输协议保护，不声称已经对所有工具的业务结果做了完整 schema 校验。

新增测试首先在六个原 client 上运行：34 项场景中 7 项通过、27 项不满足新契约；这是重复场景和清理契约的失败计数，不是 27 个独立线上故障。旧结果记在被忽略的 `outputs/worker-lifecycle-before.log`。随后更新旧测试的适配器，让它们真实加载共享实现，而不是把共享底层替换为成功 mock。

### 页面管理预览

`app/components/pdf-page-manager.tsx` 原有预览 effect 依赖 `[file, page]`，每次调用 `loadPdf`，最终销毁文档。现改为文件 effect 创建 / 释放会话、页码 effect 只请求当前页。`app/lib/pdf-preview-session.ts` 增加可选渲染比例参数，默认仍为 1，页面管理明确传入 0.7；页码仍从零基转换成 PDF.js 的一基，旋转仍由原图片 transform 展示，未修改 CSS 或预览布局。

真实三页 PDF 对照现覆盖 1 倍和 0.7 倍：相同输入、相同绘制函数，逐页加载与会话复用的 PNG 分别逐字节一致；连续 3 页解析从 3 次降为 1 次，画布仍逐页释放，文档在退出时销毁。该数据不是网络加载时间、浏览器帧率或峰值内存测速。

### 验证与边界

- 新增 `tests/worker-task-lifecycle.test.mjs`、`tests/legacy-worker-adapters.test.mjs` 和 `tests/pdf-manager-preview.test.mjs`；生命周期 / 协议 / 页面管理专项共 43 项通过。另扩展真实 PDF.js / Node Canvas 用例到页面管理的 0.7 倍。
- 受控循环 100 次成功、取消、反序列化失败，验证所有计时器与取消监听归零，每个 Worker 只终止一次。这是资源计数回归，不是浏览器长时间内存验收。
- 本阶段新增 44 项测试（43 项生命周期 / 协议 / 页面管理，以及 1 项 0.7 倍真实 PDF 对照），全站现为 **558 项通过，0 失败、0 跳过**；旧回归继续通过。
- 分步运行完整质量检查：`npm run lint`、`npm run typecheck`、`npm run build`、`npm run test:unit` 均退出码 0。生产构建结束后才运行依赖产物的全量测试，测试期间不重建 dist；日志为被忽略的 `outputs/task-lifecycle-lint.log`、`task-lifecycle-typecheck.log`、`task-lifecycle-build.log`、`task-lifecycle-tests.log`。
- 构建前检查仍通过：86 项实际直接依赖、105 个工具、106 条站点地图 URL。生产目录中八个任务入口（文件、OCR、栅格、科学计算、Unity、正则、哈希、Word 生成）均生成了带哈希的独立 Worker 文件，原有真实生产 Worker 与 107 条源页面 HTTP 渲染回归通过。
- `npm audit --audit-level=low` 为 0 项已知漏洞；`git diff --check` 通过。无新增依赖或锁文件变化，网站版本保留 1.1.0，未部署、提交、推送或修改 Release。
- 大分包、vinext 静态路由分类以及已有字体类型识别提示保留在日志，没有调整阈值或隐藏警告。已保存的浏览器访问限制不绕过；Hook、Node Canvas、资源计数与 HTTP 测试不能代替真实手机 / 桌面截图、触控、字体及 OCR 子线程实际回收验收。

## 第二阶段：结果继续处理（2026-10-27）

为图片压缩 / 转换、换色、视频单帧、图片转 PDF、页面管理及页码 / 裁切增加浏览器内结果衔接，目标需要确认接收；不自动覆盖输入，不把 ZIP 当作图片传递，也不持久化用户文件。完整路径、生命周期与 581 项回归结果见 [工具结果继续处理](tool-workflows.md)。

## 第三阶段首批：图片批处理生命周期（2026-10-27）

修复图片压缩卸载后继续执行、图片转换清空 / 卸载后旧导入回填、重叠导入与读头预检迟到回调。新增可停止、保留成功结果并恢复未完成项的串行执行；沿用原格式、路径、样式和结果衔接，原生编码等待收尾，不宣称硬中断或全站队列已完成。

新增 31 项生命周期、调度及真实图片回归，全站 612 项通过；固定旧提交下 9 组压缩与 7 组转换输出逐字节一致。具体文件、影响、对照、验证和未覆盖边界见 [图片批处理优化](image-batch-lifecycle.md)。
