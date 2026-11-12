# 浏览器回归测试

使用 Playwright 测试生产构建，通过 Wrangler 本地运行时提供页面、静态资源和 Worker 路由。

```bash
npm ci
npx playwright install chromium webkit
npm run build
npm run test:browser
```

默认运行桌面 Chromium、Pixel 7 参数的移动 Chromium、iPhone 13 参数的移动 WebKit。手机参数包含视口、触摸和设备像素比，浏览器会真实执行 JavaScript、CSS、Canvas、Worker 与下载流程；它不能代替 iPhone/Android 实机、摄像头、麦克风和硬件编解码验收。

单元测试默认最多使用 4 个并发进程，浏览器测试使用 2 个 Worker，避免字体、OCR 和浏览器进程争抢资源引发超时。

本机已安装 Chrome 时，可在 PowerShell 中使用它运行 Chromium 项目：

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:browser -- --project=desktop-chromium --project=mobile-chromium
```

测试自动在 `127.0.0.1:4180` 启动本地服务。已有服务只在本地复用，CI 总是自行启动。需要先重建产物后再测，避免复用过期预览。`npm start` 使用 Wrangler；线上发布仍使用原有 `wrangler deploy`。

覆盖范围：

- 全部 127 个工具的浏览器脚本错误、页面标题和横向溢出；
- 四种布局的收藏及刷新持久化、收藏夹切换；
- 设置返回、主题持久化、折叠分组、手机卡片点击与桌面悬浮；
- 渐变色标标签布局；
- 真实 PNG 导入、Canvas 处理、下载文件签名与尺寸；
- 中文文本导入、编辑草稿与 UTF-8 下载；
- 繁重正则取消后重新启动 Worker；
- 旧 YouTube 路径返回 404。

失败时保存截图和 trace，报告写入 `playwright-report/`，附件写入 `test-results/`。这两个目录不提交；CI 失败时上传报告，保存 7 天。

## CSS 第一批拆分

`app/globals.css` 作为有序入口，`app/styles/sections/` 按主题与公共布局、媒体、图片设计、文档与响应式、工作台、文字与生活工具、首页视图拆分。`additional-utilities.css` 与最后加载的 `mobile-tools.css` 保留原位置。

拆分本身保留原声明、选择器、动画与级联顺序，展开文本与构建 CSS 均与拆分前相同，属于维护结构调整。本轮随后单独修复了世界时钟下拉框的手机溢出，增加两条宽度约束；不宣称首屏下载变小。后续按工具细分时，应在此测试集通过后再改变按路由加载策略。
