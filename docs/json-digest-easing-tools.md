# JSON 路径、文本摘要与 CSS 缓动

2026-10-27，第八批补充三项工具。先对照现有 105 项工具，再查阅 GitHub 项目、发布包、原始许可证及标准文档；不重复 JSON 格式化、文件哈希、CSS 阴影等既有工具，不复制参考站点页面。

## 选型

| 工具 / 路径 | 实际采用 | 用途与边界 |
| --- | --- | --- |
| JSON 路径提取 `/json-pointer` | [janl/node-jsonpointer](https://github.com/janl/node-jsonpointer) 的 jsonpointer 5.0.1，MIT；[RFC 6901](https://www.rfc-editor.org/rfc/rfc6901)；复用已有 jsonc-parser | 单条 / 批量路径、数组索引、空键、~0 / ~1、URI 片段、整个文档；输出路径、found 与原始值。不是 JSONPath、JMESPath、过滤语言或 JavaScript 求值，不支持修改输入 |
| 文本哈希与 HMAC `/text-digest` | 调研 [noble-hashes](https://github.com/paulmillr/noble-hashes) 的 SHA / HMAC 及 Web Crypto 方向；实际直接调用浏览器 [SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign)，不安装额外密码算法库 | UTF-8 / Hex、SHA-256 / 384 / 512、哈希或 HMAC、Hex / Base64 输出、摘要核对。不做加密、密码存储或正式的消息认证协议，不支持 MD5 / SHA-1 |
| CSS 缓动曲线 `/easing-curve` | [gre/bezier-easing](https://github.com/gre/bezier-easing) 3.2.0，MIT；对照 [CSS cubic-bezier](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/easing-function/cubic-bezier) | 四个数值 / 滑块、六种预设、回弹、SVG 曲线、显式播放 / 停止 / 复位及 CSS 导出。编辑器、布局和资源管理独立实现，不集成外部完整应用 |

两个新增包均精确锁定、无运行时依赖，附带类型和原始 MIT 文本。`scripts/prepare-document-assets.mjs` 分发对应许可至 `public/vendor-licenses`，回归核对原文一致；项目 MIT 不变。

## 实现与安全边界

- `app/lib/json-pointer.ts`：预先检查 100 层，再建立有 25 万节点上限的只读结构索引，禁止重复字段。索引用无原型对象与 Symbol 元数据，读取前校验自有字段和规范数组索引，不将库的 setter 暴露给页面。合法的 `__proto__` / `constructor` 自有字段仍能读取，缺失的继承属性不能访问。
- 提取直接采用 AST 记录的源文本范围，而非把原值转换成 Number 后再 stringify，因此长整数、-0 和指数写法不被改写。`null`、`false`、`0` 均属于命中；只有字段不存在才输出 found: false。批量结果始终是带路径的 JSON 数组。
- 输入 JSON 最多 500 万字符，路径合计 32768 字符 / 200 条，输出最多 3200 万字符。空行忽略，路径首尾空格保留；根节点用 `#`，空字段用 `/`。单次路径语法或数组索引错误使本批报错，不把它伪装成成功的空结果。
- `app/workers/local-files.worker.ts` 按需加载提取引擎；`app/lib/file-worker-client.ts` 只对本动作设置 30 秒保护，其余任务维持原时限。取消 / 超时由既有共享生命周期结束线程，无主线程脚本执行回退。
- `app/lib/text-digest.ts`：检查 Unicode 代理字符和完整 Hex 字节，不隐式改变 Unicode、空格或换行；UTF-8 的空内容可计算，HMAC 密钥不能为空且最多 64 KiB。使用不可导出的临时 CryptoKey；字节工作缓冲在 finally 清零，但 JavaScript 字符串、浏览器内部 CryptoKey 和 GC 不能保证安全擦除，不宣称可防浏览器扩展或内存攻击。
- 文本摘要内容最多 200 万字符，需 HTTPS / localhost。取消检查防止迟到结果提交，但不能硬中断已开始的原生密码操作。摘要核对仅为本地 Hex 比较，不宣称恒定时间、签名来源验证或服务器认证。
- `app/lib/easing-curve.ts`：x 在 0～1，编辑器 y 在 -2～3，时长 100～10000ms；这是编辑器选择的工作范围，不是 CSS 对 y 的全部限制。预览、曲线与导出统一四位精度，不把任意文本拼进 CSS。
- `app/components/easing-curve.tsx`：使用 Web Animations，只在用户点击后播放；换参数、重复播放、停止及卸载会取消旧实例并解绑回调，旧完成事件不改新状态。开启减少动态效果时保留曲线和 CSS，不播放位移；浏览器不支持时明确提示，不影响导出。不改变首页或其他工具的动画。
- 三项均使用已有工具壳、表单、主题色和下载控件；新 SVG、滑块、跑道采用主题变量，手机沿用 680px 单列布局和 16px 输入字体。摘要设置在手机单列，曲线滑块有 44px 操作高度。所有输入仅在当前页内存，不上传、自动复制、写 URL、草稿或持久化存储。

## 验证

- 新增 23 项：`tests/eighth-utilities.test.mjs` 的 15 项逻辑 / 许可检查、`eighth-utility-interactions.test.mjs` 的 5 项交互 / 线程检查、`eighth-route-render.test.mjs` 的 3 项生产页面检查。
- 路径测试覆盖 RFC 风格字段、转义 / 编码、标量根、重复路径、空字段、缺失与 falsy、长数字原文、非法语法 / 深度 / 节点 / 容量、继承属性与合法同名字段。实际生产 ES 模块 Worker 也执行路径提取和错误分支，不以未打包函数替代生产线程。
- SHA / HMAC 用 Node crypto 独立 API、SHA-256 已知摘要与 RFC 4231 向量对照，覆盖三种 SHA2、中文、空内容、字节编码、错误、取消与缓冲清理。不是浏览器密码模块认证。
- 曲线取样与独立二分求解对照，涵盖预设、极端切线、回弹和非法数值；Hook 回归检查预览参数、减少动态效果、失败降级、重复播放、迟到完成、停止与卸载。没有把 Hook 当作真实触控或视觉检查。
- 三条新路由在生产 Worker 中返回 200，标题、表单和初始内容正确；首页在 390px / 1440px 参数下，四种布局均覆盖新工具的搜索 / 收藏与动画可见性回归。全站为 108 个工具、109 条 sitemap URL，实际直接依赖 88 项；原路径不变。
- `npm run lint`、`npm run typecheck`、`npm run build`、`npm run test:unit` 通过；全站 **635 项通过，0 失败、0 跳过**，测试期间不重建 dist。`npm audit --audit-level=low` 为 0 项已知漏洞；日志在被忽略的 `outputs/eighth-tools-*.log`。
- 页面入口原始分包约路径 2.9 kB、摘要 6.0 kB、曲线 6.4 kB，路径 Worker 引擎约 3.4 kB；不含已有 React、工具壳、JSON 解析等共享依赖。这里只是构建字节数，不是浏览器首屏 / 内存 / 帧率测速。

仍未完成真实桌面 / 手机视觉、触控、浏览器 Web Animations 和 Web Crypto 兼容验收，已保存的浏览器访问限制未绕过。原有超过 500 kB 的分包与 vinext 路由分类提示保留，不调高阈值掩盖。未部署、提交、推送、更新 Release 或版本；仍为 1.1.0。
