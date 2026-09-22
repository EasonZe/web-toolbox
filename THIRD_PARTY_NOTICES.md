# 第三方声明

多功能工具箱自身代码使用 MIT License。第三方依赖、字体与构建时复制的运行时资源仍遵循各自许可证；本文件不是这些许可证的替代品，准确文本以依赖包和资源目录中附带的许可证为准。

## 主要运行时依赖

| Component | Purpose | License |
| --- | --- | --- |
| React / Next.js / vinext | UI、路由与 Cloudflare 构建 | MIT |
| CodeMirror 6 | 纯文本编辑、撤销、查找与替换 | MIT |
| `@fix-webm-duration/fix` | WebM 录音时长修正 | MIT |
| Mediabunny / `@mediabunny/mp3-encoder` | 浏览器音视频读取、编码与封装 | MPL-2.0 |
| `@morsecodeapp/morse` | 摩斯电码转换 | MIT |
| `@soundtouchjs/audio-worklet` | 音频变速与变调 | MPL-2.0 |
| Transformers.js | 浏览器端智能抠图模型运行时 | Apache-2.0 |
| DOMPurify | 文档转换内容净化 | MPL-2.0 OR Apache-2.0 |
| PDF.js | PDF 读取、字体、CMap 与图像解码资源 | Apache-2.0 |
| pdfmake | PDF 生成 | MIT |
| Mammoth | DOCX 内容读取 | BSD-2-Clause |
| docx | DOCX 生成 | MIT |
| spin-wheel | 抽签转盘绘制与动画 | MIT |
| Papa Parse | CSV 名单读取 | MIT |
| read-excel-file | XLSX 名单读取 | MIT |
| change-case | 英文命名格式转换 | MIT |
| Color Thief | 图片主色提取 | MIT |
| date-fns | 日期计算 | MIT |
| FIGlet | ASCII 字符画 | MIT |
| html-to-pdfmake | HTML 到 PDF 定义转换 | MIT |
| React Icons | 界面图标 | MIT |
| OpenCC.js | 简繁中文转换 | MIT AND Apache-2.0 |
| mathjs | 算式与科学计算 | Apache-2.0 |
| Three.js | 3D 模型预览与转台渲染 | MIT |
| function-plot | 函数图像绘制 | MIT |
| gifenc | GIF 编码 | MIT |
| image-q | 图像颜色量化 | MIT |
| QRCode / jsQR | 二维码生成与解析 | MIT / Apache-2.0 |
| hash-wasm | 浏览器文件哈希 | MIT |
| youtubei.js | 媒体服务相关协议能力 | MIT |

构建与开发工具包括 TypeScript、Vite、vinext、Wrangler、Cloudflare Vite 插件、`@cloudflare/puppeteer`、Tailwind CSS、ESLint 与相关类型包；这些包的锁定版本和许可证字段可在 `package-lock.json` 中核对。

间接依赖中还包含 BSD、ISC、BlueOak-1.0.0、CC-BY-4.0 等宽松或署名许可证。`sharp` 的可选平台二进制会带入 LGPL-3.0-or-later 的 `libvips` 包；`jszip` 可按 MIT 许可使用；`png-js` 的包元数据未填写 `license` 字段，但发布包附带 MIT License。完整审查结果见 `docs/dependency-audit.md`。

## 平台服务

| 服务 | 数据来源 | 说明 |
| --- | --- | --- |
| `eason-daoyin-api` | 抖音公开页面、官方播放器与媒体地址；Cloudflare Browser Rendering | 源码与部署配置均收录在本仓库 |
| `eason-bilibili-api` | Bilibili 官方公开播放接口与媒体 CDN | 源码与部署配置均收录在本仓库 |

抖音 Worker 不调用第三方解析 API。平台页面结构、访问策略和媒体地址可能发生变化；Fork 应部署自己的 Worker，并自行评估平台条款、内容授权、隐私与合规要求。

完整依赖、锁定版本和包许可证字段见 `package.json` 与 `package-lock.json`。

## 字体与随包资源

- `public/fonts/noto-sans-sc/`：Noto Sans SC，SIL Open Font License 1.1；目录内包含许可证与来源说明。
- `public/pdfjs/`：构建时由 `pdfjs-dist` 复制，不进入 Git；运行时资源及许可证由 `scripts/prepare-document-assets.mjs` 一并准备。
- `public/soundtouch/`：构建时由 `@soundtouchjs/audio-worklet` 复制，不手工维护；目录内包含上游许可证。
- `public/images/eason-avatar.png`：站点维护者的个人头像素材，不属于 MIT 软件授权范围，未经原权利人许可请勿复用。

## 参考实现

- Bilibili Worker 的流程设计参考 [iawia002/lux](https://github.com/iawia002/lux) 的成熟下载器结构；本项目基于公开播放接口独立实现 Cloudflare Worker，没有复制其 Go 源码。
- 短链接设计参考 [miantiao-me/Sink](https://github.com/miantiao-me/Sink)；本项目独立实现 D1 存储、短码、有效期和跳转逻辑，没有复制其源码。

## 更新要求

新增或升级第三方依赖时，应检查其许可证与分发要求，更新本文件，并确保构建产物包含必须随附的许可证文本。
