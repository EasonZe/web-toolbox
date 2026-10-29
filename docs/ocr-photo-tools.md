# OCR 与图像工具

本轮保留原有路径和风格。GIF 在 `/gif-extract` 上增加编辑，不另建重复入口；新增 `/texture-memory`、`/id-photo`、`/font-preview`。

## OCR

现有 Tesseract 使用 `best_int` 中英文模型，并非快速模型。用户反馈中文空格过多；原先测试在比较中文时移除了空格，不能验证文字间距。本轮增加不删除空格的输出回归。

- 默认采用 [官方 PaddleOCR.js](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js) 0.4.2 与 PP-OCRv5 mobile 检测、识别模型；保留 Tesseract 的语言与页面布局选项。
- 识别前可裁剪百分比范围、旋转、放大、灰度或反色。默认放大 2×，工作图按桌面 1600 万 / 移动 800 万像素及最长边 6000px 缩放；显示实际尺寸与倍率，原文件不变。
- 中文间距整理只移除中文字符或中文标点之间的单个 ASCII 空格，不跨换行，不改英文词间空格、Tab、连续空格或缩进。它是可关闭的文本处理，不是恢复漏字或表格结构。原始结果独立保留、可导出，编辑后的内容不会被“查看原文”覆盖。
- 原始模型平均分不是准确率，两引擎的分数口径不能直接比较。Paddle 中文样本改善不代表所有英文、数字、艺术字、表格或手写都更好；例如测试中 `English 123` 在混合行可能成为 `English123`，不自动猜回空格，可切换 Tesseract 英文模式并核对原文。
- 参考 [Tesseract 图像质量建议](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)，提供人工范围和方向控制，不冒充自动纠偏或透视矫正。

### 引擎与资源

SDK 在本项目拥有的可终止 Worker 内运行，直接使用其支持的 OpenCV Mat 输入。CPU WASM 单线程，不依赖 WebGPU 或新增隔离响应头；不启动 SDK 默认 Worker，不回落到其默认模型 CDN。Vite 适配仅将 SDK 的 ORT 导入定向为 `onnxruntime-web/wasm`、停用未使用的默认 Worker 工厂，并保留 OpenCV 的真实 Worker 环境判断；不修改模型和检测 / 识别算法。升级 SDK 时需重新验证这些适配。

两份官方模型归档在首次构建时下载，校验精确字节数与 SHA-256，缓存到已忽略的 `public/ocr/`；校验失败会阻止构建。运行时模型、ORT 模块和 WASM 均从站内加载，图片不发送到服务器；构建时首次下载模型需要网络。没有将模型二进制塞入 Git 历史。原始许可随构建分发，记录见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

`node scripts/measure-ocr-quality.mjs` 可复现原始 Tesseract / Paddle 的同图比较：16 / 24 / 36px 的 Noto Sans SC 三行印刷体样本，旧引擎均插入中文空格，新模型均连续输出“多功能工具箱”和“生活明朗万物可爱”。这是固定合成样本，不是用户原图准确率、全语言基准或手机性能测试。用户提供的是结果截图，不能据此计算原始输入图片的字符准确率。

## GIF 拆帧与编辑

复用 [gifuct-js](https://github.com/matt-way/gifuct-js) 的像素解码、独立完整画面合成和 [gifenc](https://github.com/mattdesl/gifenc) 编码；不复制参考站点源码。

- 保留原 PNG、ZIP、帧范围和预览。提取后的完整 PNG 作为编辑缓存，时间轴只改帧顺序、勾选、删除、逐帧 / 统一延迟和循环配置，不重新解析源 GIF。
- 最多导出 200 帧；删除或跳帧不自动累加时长。延迟为 10ms 整数刻度，原始 0ms 保留，超界不取整；播放器的最短延迟行为可能不同。
- 每帧独立后台解码、调色板、编码与 Blob 封装，避免所有帧 RGBA 同时驻留。始终保留透明槽并使用完整帧清除，避免透明拖影。
- 超过 255 个不透明色时量化，结果标明量化帧数；这不是无损 GIF 编辑。原始注释、应用扩展和循环元数据不保留，循环以编辑设置为准。

## 贴图显存估算

以 [Khronos Vulkan 格式与块压缩规范](https://registry.khronos.org/vulkan/specs/latest/html/vkspec.html#formats) 和 [KTX-Software](https://github.com/KhronosGroup/KTX-Software) 为依据，独立计算，不加入压缩器或解析外部纹理。

支持未压缩通道、BC1/3/4/5/6H/7、ETC2、ASTC，2D / 阵列 / 立方体、数量和 Mipmap。每一级尺寸向下取整、块数单独向上取整，以 BigInt 求和；不将完整 Mipmap 固定近似为 4/3。理论载荷不等于 PNG 大小或 GPU 驱动实际分配，未验证硬件格式支持，不包含 MSAA、3D 体积纹理或 CPU 副本。

## 证件照与相纸

参考 [HivisionIDPhotos](https://github.com/Zeyi-Lin/HivisionIDPhotos) 的尺寸、底色与打印流程，裁切和排版独立实现，不移植其 Python 服务和权重。

支持常见毫米预设、自定义尺寸 / DPI、裁切焦点与缩放、白蓝红和自定义底色、PNG / JPEG、6 寸 / A4 / 自定义相纸、间距、张数与空隙裁切线。输出写入 PNG pHYs 或 JPEG JFIF 分辨率元数据，图片像素按 mm×DPI/25.4 四舍五入；打印应使用实际尺寸，不能强制打印软件遵从元数据。

底色仅填充透明部分。可用已有透明 PNG，或点击启用 [Xenova/MODNet](https://huggingface.co/Xenova/modnet) 的人像抠图；模型卡为 Apache-2.0，固定修订 `fa2fa546052fba4c08921230a26cc69a333fca12`，首次显式操作才从 Hugging Face 下载约 26 MB，照片不上传。抠图工作图最长边 2048px，不用现有 ISNet 权重。发丝、边缘、姿态、尺寸与机构要求仍需人工核对，不宣称自动通过证件审核。

## 本地字体预览

参考 [FontFaceObserver](https://github.com/bramstein/fontfaceobserver) 的显式加载原则，直接使用原生 [FontFace](https://developer.mozilla.org/en-US/docs/Web/API/FontFace)，不新增字体解析或安装依赖。

本地 TTF / OTF / WOFF / WOFF2：最多 8 个、单个 64 MiB、原始总计 128 MiB，并核对压缩容器声明的解压大小。每批逐个加载，错误时全批回滚，重选、清空和卸载只移除该页拥有的 FontFace；取消不保证中断浏览器原生字体解码，但阻止迟到注册。无需 Blob 字体 URL、系统字体枚举或权限，不安装、不导出字体。

支持自定义样文、字号和字重。禁用合成假粗体；静态字体不保证有字重变化。缺失字符会回退，预览不是完整字形覆盖检测；压缩头检查不替代浏览器字体解析器。TTC / OTC 集合不支持。

## 验证边界

服务端构建先替换浏览器任务工厂，再移除 Vite 跨环境 Worker 缓存重复发出的引擎资源；客户端资源不变。修正前后使用相同 Wrangler dry-run，服务端 gzip 从 18,397.92 KiB 降至 6,113.62 KiB。构建资源隔离检查及对实际客户端产物的 OCR 推理回归均通过；dry-run 不代表已部署。

本轮 `lint`、`typecheck`、生产构建及 782 项回归测试通过，`npm audit --audit-level=low` 为 0 项漏洞。

数学、Canvas 像素、PNG / JPEG 元数据、实际 GIF 重新解码、模型摘要、真实 OCR 推理与取消 / 迟到结果均有回归。Node Canvas、Hook 与 Worker 平台适配不是浏览器视觉或触控验收。MODNet 的真实人像质量、不同设备字体栅格化及真实打印仍需实机核对。
