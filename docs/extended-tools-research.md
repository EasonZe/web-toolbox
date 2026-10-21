# 新工具调研与实现

## 游戏资源工具（2026-10-19）

| 工具 | GitHub 调研 | 最终选择与边界 |
| --- | --- | --- |
| Unity 资源包预览 | [Cobertos/unitypackage_extractor](https://github.com/Cobertos/unitypackage_extractor)（MIT，Python 格式映射参考）、[Perfare/AssetStudio](https://github.com/Perfare/AssetStudio)（MIT，运行时资源浏览桌面程序）、[InvokIT/js-untar](https://github.com/InvokIT/js-untar)（MIT，浏览器 TAR 库）、[unjs/nanotar](https://github.com/unjs/nanotar)（MIT）与 [ayuhito/modern-tar](https://github.com/ayuhito/modern-tar)（MIT） | 选择 modern-tar 0.8.5 的 Web Streams 严格解码；已有依赖链使用此库，提升为明确的运行时依赖。浏览器原生 gzip 流解压，后台线程读取 GUID / pathname / asset / asset.meta / preview.png，保留资源目录和 GUID。校验 TAR 校验和、截断、重复路径、链接和展开体积。不是 AssetBundle 解码器，不运行 Unity 脚本或还原场景；FBX / GLB / OBJ / STL 仅预览原始几何，其他资源可查看内嵌缩略图、文本或下载。 |

资源处理在本地 Worker 中执行，可取消；Unity 使用可折叠目录树并按可见行渲染，搜索保留父目录，勾选目录可批量选择当前筛选范围的后代资源。更换参数会清理旧下载结果。modern-tar 没有运行时传递依赖，原始许可证由构建脚本复制至 `public/vendor-licenses/`。没有嵌入第三方工具页面或发送文件到第三方服务器。

## 通用工具（2026-10-13）

调研日期：2026-10-13。优先复用成熟项目的浏览器 API，不嵌入第三方工具网站、不复制未知许可证的整站源码。版本以 `package-lock.json` 为准。

| 工具 | 项目 / 实现依据 | 接入与边界 |
| --- | --- | --- |
| PDF 页面管理 | [Hopding/pdf-lib](https://github.com/Hopding/pdf-lib)；复用 [PDF.js](https://github.com/mozilla/pdf.js) 预览 | Worker 合并、拆分、旋转与重排；密码 PDF 拒绝，不承诺保留签名、书签或交互表单 |
| 文本差异对比 | [kpdecker/jsdiff](https://github.com/kpdecker/jsdiff) | 行级左右对照与修改字符标记；限制文本规模和差异计算时间 |
| 重命名 / ZIP | [101arrowz/fflate](https://github.com/101arrowz/fflate) | Worker 压缩；ZIP 先检查中央目录、路径、体积、压缩比和加密标记，再提取并校验 CRC32；不支持 ZIP64、符号链接或分卷 |
| 图片 OCR | [naptha/tesseract.js](https://github.com/naptha/tesseract.js) 和 [tessdata](https://github.com/naptha/tessdata) | 本地 Worker，中英文 LSTM 模型与引擎自托管；识别存在误差，需要用户核对 |
| JSON | [microsoft/node-jsonc-parser](https://github.com/microsoft/node-jsonc-parser) | 严格 JSON，拒绝注释、尾逗号、过深嵌套；按词法格式化，保留大整数而非解析后重新序列化 |
| Markdown | [markedjs/marked](https://github.com/markedjs/marked) + 现有 [DOMPurify](https://github.com/cure53/DOMPurify) | 实时渲染、HTML 净化、禁用外部图片与嵌入内容，不执行脚本 |
| 字幕 | [plussub/srt-vtt-parser](https://github.com/plussub/srt-vtt-parser) | UTF-8 SRT/VTT、文字编辑、整数毫秒调整与导出；不保留复杂 VTT 排版。调研过 subtitle.js，但其 Node 流依赖不适合本站浏览器包，未引入 |
| 音频裁剪拼接 | 已有 [Mediabunny](https://github.com/Vanilagy/mediabunny) 与 Web Audio API | 解码后 Worker 处理采样，区间、片段顺序、逐段淡入淡出与真实 PCM WAV 导出 |
| EXIF | [MikeKovarik/exifr](https://github.com/MikeKovarik/exifr) | 元数据读取；以浏览器重新绘制清除原元数据，保留可见方向。PNG 无损重编码，JPG/WebP 可能有画质变化 |
| 时间戳 | [marnusw/date-fns-tz](https://github.com/marnusw/date-fns-tz) + 现有 date-fns / Intl | 秒、毫秒和 IANA 时区转换，拒绝非法日期与夏令时不存在时间，重复时段采用库默认偏移 |
| Unicode | JavaScript Unicode 属性、码点迭代与 TextEncoder | 检查码点、UTF-16、UTF-8、格式控制字符、零宽空格、特殊空白与未配对代理项，不擅自改变文字 |
| 无缝贴图 | 浏览器图像解码和 CSS 重复平铺 | 本地预览、缩放、边界辅助线，不改变原文件 |
| RGBA 通道 | Canvas + 本地 Worker | 每个输出通道可指定图片 R/G/B/A/亮度或常量、反转；8 位通道，不额外做颜色空间变换 |
| 全景预览 | 现有 [mrdoob/three.js](https://github.com/mrdoob/three.js) 与 OrbitControls | 内向球面、拖动视角、视野缩放、全屏与 GPU 资源释放；需要 WebGL 与约 2:1 的全景图 |
| 高度转法线 | Sobel 梯度、Canvas + 本地 Worker | 强度、X/Y 反转、循环边界采样、切线空间 RGB 法线和原尺寸 PNG 导出 |

所有新增工具均使用本站主题变量、首页搜索与收藏。文件不上传至第三方处理服务。大文件、页面数、像素和采样点设有上限，避免浏览器无提示耗尽内存。

OCR 引擎、语言模型和依赖许可证随构建部署。没有新增收费云服务、用户追踪或外部解析入口。
