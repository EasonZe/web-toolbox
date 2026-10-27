# 第三方声明

多功能工具箱自身代码使用 MIT License。第三方依赖、字体与构建时复制的运行时资源仍遵循各自许可证；本文件不是这些许可证的替代品，准确文本以依赖包和资源目录中附带的许可证为准。

## 主要运行时依赖

| Component | Purpose | License |
| --- | --- | --- |
| React / Next.js / vinext | UI、路由与 Cloudflare 构建 | MIT |
| CodeMirror 6 | 纯文本编辑、撤销、查找与替换 | MIT |
| [JsBarcode](https://github.com/lindell/JsBarcode) 3.12.3 | 条形码校验与 SVG / PNG 生成 | MIT |
| [jwt-decode](https://github.com/auth0/jwt-decode) 4.0.0 | JWT 本地解码，不验证签名 | MIT |
| [PDF-lib](https://github.com/Hopding/pdf-lib) | PDF 合并、拆分、页序、旋转与图片合成 PDF | MIT |
| [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 3.29.5 | 汉字拼音、声调、首字母和姓氏模式 | MIT |
| [entities](https://github.com/fb55/entities) 8.1.0 | HTML 命名与数字实体编码解码，不执行 HTML | BSD-2-Clause |
| [yaml](https://github.com/eemeli/yaml) 2.9.1 | YAML 1.2 配置解析与序列化，限制别名与转换类型 | ISC |
| [cron-parser](https://github.com/harrisiirak/cron-parser) 5.10.2 / Luxon 3.7.2 | Cron 解析、时区与后续时间预览 | MIT |
| [file-type](https://github.com/sindresorhus/file-type) 22.2.0 | 二进制文件头识别，不执行文件 | MIT |
| [Pixelmatch](https://github.com/mapbox/pixelmatch) 8.0.0 | 原尺寸图片视觉像素差异比较 | ISC |
| [ipaddr.js](https://github.com/whitequark/ipaddr.js) 2.5.0 | IPv4 / IPv6 严格地址解析与标准化 | MIT |
| [Culori](https://github.com/Evercoder/culori) 4.0.2 | sRGB / OKLab 预乘透明度插值 | MIT |
| [jsonpointer](https://github.com/janl/node-jsonpointer) 5.0.1 | RFC 6901 只读路径提取；本项目额外校验自有字段与数组索引 | MIT |
| [bezier-easing](https://github.com/gre/bezier-easing) 3.2.0 | CSS 贝塞尔缓动取样；编辑器独立实现 | MIT |
| [jsdiff](https://github.com/kpdecker/jsdiff) | 文本行级、字符级差异比较 | BSD-3-Clause |
| [fflate](https://github.com/101arrowz/fflate) | 本地 ZIP 打包、解压与批量重命名下载 | MIT |
| [Tesseract.js](https://github.com/naptha/tesseract.js) / core | 中英文图片 OCR 与 WebAssembly 引擎 | Apache-2.0 |
| [naptha/tessdata](https://github.com/naptha/tessdata) | 中英文 OCR 模型；见 `licenses/OCR-models-NOTICE.md` | MIT（数据包）/ Apache-2.0（上游模型） |
| [jsonc-parser](https://github.com/microsoft/node-jsonc-parser) | 严格 JSON 校验、错误位置与无精度损失格式化 | MIT |
| [Marked](https://github.com/markedjs/marked) | Markdown 解析；输出经 DOMPurify 净化 | MIT |
| [exifr](https://github.com/MikeKovarik/exifr) | 图片 EXIF、XMP、IPTC 与 GPS 元数据读取 | MIT |
| [SRT/VTT Parser](https://github.com/plussub/srt-vtt-parser) | 浏览器字幕解析 | MIT |
| [date-fns-tz](https://github.com/marnusw/date-fns-tz) | IANA 时区与时间戳转换 | MIT |
| `@fix-webm-duration/fix` | WebM 录音时长修正 | MIT |
| Mediabunny / `@mediabunny/mp3-encoder` | 浏览器音视频读取、编码与封装 | MPL-2.0 |
| `@morsecodeapp/morse` | 摩斯电码转换 | MIT |
| `@soundtouchjs/audio-worklet` | 音频变速与变调 | MPL-2.0 |
| Transformers.js | 浏览器端智能抠图模型运行时 | Apache-2.0 |
| DOMPurify | 文档转换内容净化 | MPL-2.0 OR Apache-2.0 |
| [PDF.js](https://github.com/mozilla/pdf.js) | PDF 读取、页面导出、文字提取、字体、CMap 与图像解码资源 | Apache-2.0 |
| pdfmake | PDF 生成 | MIT |
| Mammoth | DOCX 内容读取 | BSD-2-Clause |
| docx | DOCX 生成 | MIT |
| spin-wheel | 抽签转盘绘制与动画 | MIT |
| [Papa Parse](https://github.com/mholt/PapaParse) | CSV 名单读取、CSV / TSV / JSON 表格转换 | MIT |
| read-excel-file | XLSX 名单读取 | MIT |
| change-case | 英文命名格式转换 | MIT |
| Color Thief | 图片主色提取 | MIT |
| date-fns | 日期计算 | MIT |
| FIGlet | ASCII 字符画 | MIT |
| html-to-pdfmake | HTML 到 PDF 定义转换 | MIT |
| React Icons | 界面图标 | MIT |
| OpenCC.js | 简繁中文转换 | MIT AND Apache-2.0 |
| mathjs | 算式与科学计算 | Apache-2.0 |
| [MathLive](https://github.com/arnog/mathlive) | 科学计算工具的可视化公式编辑与数学键盘 | MIT |
| [Cortex Compute Engine](https://github.com/cortex-js/compute-engine) | 科学计算工具的符号运算、方程求解与微积分 | MIT |
| [KaTeX fonts](https://github.com/KaTeX/katex-fonts) | MathLive 附带的数学字体；许可证保存于 `licenses/KaTeX-fonts-LICENSE.txt` | MIT |
| Three.js | 3D 模型预览与转台渲染 | MIT |
| function-plot | 函数图像绘制 | MIT |
| gifenc | GIF 编码 | MIT |
| image-q | 图像颜色量化 | MIT |
| QRCode / jsQR | 二维码生成与解析 | MIT / Apache-2.0 |
| hash-wasm | 浏览器文件哈希 | MIT |
| youtubei.js | 媒体服务相关协议能力 | MIT |

构建与开发工具包括 TypeScript、Vite、vinext、Wrangler、Cloudflare Vite 插件、`@cloudflare/puppeteer`、Tailwind CSS、ESLint 与相关类型包；这些包的锁定版本和许可证字段可在 `package-lock.json` 中核对。

- [tinyglobby](https://github.com/SuperchupuDev/tinyglobby)（MIT）为构建工具提供路径匹配；`packages/glob-compat` 是本项目 MIT 许可的有限 API 适配层，不包含 fast-glob、micromatch 或 braces 的源码。
- [argparse](https://github.com/nodeca/argparse) 2.0.1（Python-2.0）仅用于 Mammoth CLI 兼容；上游发布包附带许可证。网站浏览器转换路径不打包 CLI。
- `@puppeteer/browsers` 3.2.4（Apache-2.0）及其 `modern-tar`（MIT）用于开发依赖的浏览器管理；Cloudflare Worker 保留原远程 Browser Rendering API。

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
- `public/mathlive/`：构建时由 MathLive 复制版本匹配的数学字体；附带 MathLive、Compute Engine 与 KaTeX fonts 的 MIT 许可证，公式输入不依赖第三方 CDN。
- `public/ocr/`：构建时复制 Tesseract.js、匹配的 core 及中英文语言模型，OCR 图片不上传，目录附带许可证与模型来源说明。
- `public/vendor-licenses/`：构建时复制新增浏览器依赖的原始许可证文本，随站点静态资源一起分发。
- `public/soundtouch/`：构建时由 `@soundtouchjs/audio-worklet` 复制，不手工维护；目录内包含上游许可证。
- `public/images/eason-avatar.png`：站点维护者的个人头像素材，不属于 MIT 软件授权范围，未经原权利人许可请勿复用。

## 参考实现

- 本轮继续参考 ToolKnit 的维护文档中解析 / 渲染分离、预览完成后替换、任务生命周期与构建一致性检查的通用思路；按本项目 React / PDF.js / Worker 架构独立实现，没有复制其代码、素材或引入 PDF-to-Word 引擎，保留本项目 MIT 许可。详见 [工程优化记录](docs/toolknit-optimization.md)。

- 第七批只参考 [ToolKnit Desktop](https://github.com/ZihangDong/toolknit-desktop) 的功能方向，不复制其源码、素材、Tauri/Rust 程序或 PDF-to-Word 引擎。其作者代码并非本项目可直接复用的 MIT 代码；不能因仓库公开而推定可集成。PDF 复用 PDF-lib（MIT）、PDF.js（Apache-2.0）及项目内 Noto Sans SC（OFL-1.1）；`@pdf-lib/fontkit` 1.1.1 的 README / npm 元数据明确声明 MIT，但未附独立 LICENSE，构建会保留原始 README、元数据、带内嵌版权声明的完整原包及 [来源声明](licenses/pdf-lib-fontkit-NOTICE.md)，不伪造上游版权头。其内嵌 Google Brotli 的 Apache 声明与 pako 许可分别保留，不能笼统按 MIT 覆盖。
- PPTX 只解析包内结构，使用 saxes 6.0.0（ISC）与 xmlchars 2.2.0（MIT），复用 fflate（MIT）。saxes npm 包未附独立 LICENSE，已从 [对应 v6.0.0 上游版本](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE) 保存原始全文并随构建分发；其仓库已归档，版本锁定，DTD / 实体与工作预算由本项目额外约束。未复制提词器或 Monkeytype 的代码、词库与界面，练习文本为本项目自写。

- 第六批使用 ipaddr.js 与 Culori 的原始 MIT 许可证并随站点分发，Culori 按 `culori/fn` 只注册所需颜色空间；`@types/culori` 仅用于开发。URL 选型调研 [jsdom/whatwg-url](https://github.com/jsdom/whatwg-url)，实际使用浏览器原生 URL / URLSearchParams，不打包额外解析器。阴影按 CSS 标准独立生成，没有复制外部生成器界面或源码。Nzh 发布包只附许可标识、未附完整许可正文，本期未采用、未分发其代码。

- 第五批依赖锁定 cron-parser、file-type、pixelmatch 的精确版本；它们及打包进入浏览器的 Luxon、strtok3、token-types、@borewit/text-codec、uint8array-extras、@tokenizer/inflate、debug、ms（MIT）、ieee754（BSD-3-Clause）原始许可证随站点分发。@tokenizer/token 仅提供类型声明，pixelmatch 的 pngjs 仅用于未打包的 CLI。视频裁剪复用未经修改的 Mediabunny（MPL-2.0），不复制参考项目源码；原有 MPL 声明继续适用。

- 第四批工具复用 PDF.js / fflate；图片网格选型调研 [Cropper.js](https://github.com/fengyuanchen/cropperjs)，没有引入另一套裁剪界面或复制其源码。颜色对比度调研 [contrast-ratio](https://github.com/siege-media/contrast-ratio) 与 [Culori](https://github.com/Evercoder/culori)，本期使用独立的 HEX / sRGB 计算，规则依据 W3C WCAG 2.2；不复制参考项目源码、不宣称整页无障碍达标。yaml 的 ISC 原始许可证随站点分发。

- 新增实用工具的功能选型参考 [Team-YM/pc-tool](https://github.com/Team-YM/pc-tool)，没有复制该项目的 HTML、CSS、JavaScript 或素材；采用本项目界面与独立实现。具体选型见 [调研记录](docs/pc-tool-research.md)。
- 第二批功能复用现有 Math.js（Apache-2.0）、Mediabunny（MPL-2.0）和 fflate（MIT）。DPI 修改参考 [shutterstock/changeDPI](https://github.com/shutterstock/changeDPI) 的元数据处理方向，调色选型调研 [evanw/glfx.js](https://github.com/evanw/glfx.js)；均未复制上游源码，实际独立实现 PNG/JPEG 结构化元数据编辑与现有栅格 Worker 的像素调整。
- 节拍器参考 [cwilso/metronome](https://github.com/cwilso/metronome)（MIT）介绍的 Web Audio 提前调度思路，没有复制其源码。新增的 JsBarcode、jwt-decode 原始许可证随网站构建分发。

- Unity 资源包读取使用 [ayuhito/modern-tar](https://github.com/ayuhito/modern-tar) 0.8.5（MIT）流式解码与校验，格式映射参考 [Cobertos/unitypackage_extractor](https://github.com/Cobertos/unitypackage_extractor)（MIT）；没有复制其 Python 源码。gzip 使用浏览器 DecompressionStream，ZIP 导出复用 fflate。
- 模型预览复用 Three.js。modern-tar 的原始许可证随站点构建分发。

- Bilibili Worker 的流程设计参考 [iawia002/lux](https://github.com/iawia002/lux) 的成熟下载器结构；本项目基于公开播放接口独立实现 Cloudflare Worker，没有复制其 Go 源码。
- 短链接设计参考 [miantiao-me/Sink](https://github.com/miantiao-me/Sink)；本项目独立实现 D1 存储、短码、有效期和跳转逻辑，没有复制其源码。

## 更新要求

新增或升级第三方依赖时，应检查其许可证与分发要求，更新本文件，并确保构建产物包含必须随附的许可证文本。
