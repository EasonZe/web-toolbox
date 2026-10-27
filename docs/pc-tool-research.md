# 实用工具选型

最新第八批（2026-10-27）：JSON 路径提取、文本哈希与 HMAC、CSS 缓动曲线，见 [GitHub 选型、实现与验证](json-digest-easing-tools.md)。

调研日期：2026-10-22。参考 [PC-TOOL](https://github.com/Team-YM/pc-tool) 仓库当前工具目录，和本项目首页清单逐项对比。

## 本次加入

| 工具 / 路径 | 选择理由 | 实现与边界 |
| --- | --- | --- |
| 密码与 UUID `/password-generator` | 补充常见开发、账号配置需求 | Web Crypto 安全随机数，拒绝采样避免取模偏差；密码包含选中的字符类型；UUID v4；批量复制与 TXT 下载；不持久化 |
| 正则表达式测试 `/regex-tester` | 补充文本提取和开发调试 | 浏览器原生 JavaScript RegExp，在独立 Worker 运行；5 秒超时终止、可取消；匹配高亮、索引与捕获组；不宣称支持 PCRE |
| JWT 解析 `/jwt-decoder` | 补充接口开发调试 | [Auth0 jwt-decode](https://github.com/auth0/jwt-decode) 4.0.0，MIT，无运行时依赖；仅解码，不验证签名；不上传或保存令牌 |
| 条形码生成 `/barcode-generator` | 与现有二维码互补，用于标签与测试数据 | [JsBarcode](https://github.com/lindell/JsBarcode) 3.12.3，MIT，无运行时依赖，附带类型声明；支持 Code128/39、EAN13/8、UPC、ITF14；校验位检查、SVG/PNG 导出 |
| 节拍器 `/metronome` | 补充音乐练习功能 | 参考 [cwilso/metronome](https://github.com/cwilso/metronome) 提前排程思路，独立实现 Web Audio 调度；30–300 BPM、重拍、细分、音量、Tap；停止/离页清理节点与音频上下文 |
| ICO 图标制作 `/ico-generator` | 网站 favicon 与桌面图标制作 | 复用本项目图片解码与资源检查；多尺寸 PNG 封装 ICO；透明底、居中裁剪或完整适配；导出 ICO 与各尺寸 PNG |

两个新增包均锁定确切版本，只在对应工具加载；许可证文本由构建脚本复制到 `public/vendor-licenses/`。正则、密码和 ICO 的规则较小且已有浏览器能力，不为简单封装再增加运行时依赖。

PC-TOOL 仓库根目录未发现标准 LICENSE 文件，README 的许可说明带有“严禁倒卖”限制。因此仅参考功能方向，没有直接移植其源码、界面或素材。本项目仍使用 MIT；依赖遵循各自 MIT 许可。

## 本次未重复加入

现有音视频转换、压缩、倒放、音频裁剪合并、图片转换、取色、JSON、Markdown、PDF 管理、文本差异、日期、倒计时等工具继续保留。未添加依赖第三方网络探测服务的端口扫描、SSL 查询，也未引入另一个媒体处理引擎。

## 处理范围

- 密码长度 8–256、批量 1–1000；UUID 也支持 1000 条。
- 正则输入 200 万字符、表达式 2 万字符；最多列出 1000 条匹配、每次展开 100 条详情；高亮显示前 5 万字符，匹配仍使用完整输入。超时/取消会终止线程，不在主线程回退执行。
- JWT 输入 10 万字符；Bearer 前缀可直接粘贴。时间显示依据本机时钟，不代表签名有效性。
- ICO 沿用图片 100 MB / 100 MP 保护范围。输出尺寸为 16、32、48、64、128、256；采用 PNG 图像的 ICO 容器，面向现代浏览器与系统。
- 节拍器被系统音频中断时停止并提示重新启动；不承诺锁屏/后台休眠中持续准确播放。

## 第一批验证结果（2026-10-22）

- ESLint、TypeScript 和生产构建通过；最终全站 373 项测试通过，0 失败、0 跳过。本次新增 19 项回归测试。
- 测试覆盖安全随机数与 UUID 格式、JWT 中文/错误输入/时间边界、真实 JsBarcode 六种编码与 SVG 图像条纹、ICO 内实际 PNG 数据及透明通道、节拍排程/取消启动/系统中断/清理。
- 对实际构建出的 ES 模块正则 Worker 执行匹配及灾难性回溯样本，确认线程可终止；客户端取消、加载失败和 5 秒超时均释放 Worker。
- 全部页面路径通过生产 Worker 的服务端渲染检查；首页既有四种布局及 390px / 1440px 条件下的搜索、收藏交互回归通过（隔离组件逻辑测试，并非浏览器视觉验收）。
- `npm audit --audit-level=low`：0 项已知漏洞。依赖锁只增加两个上述 MIT 包，无其他包版本变动。两个原始许可证已出现在构建资源目录。
- 本地浏览器预览受用户已保存访问权限限制，未绕过限制，未完成桌面/手机真实视觉验收或实机音频试听。界面复用现有单/双栏断点，并将新增手机字号规则限定在这六个工具中。
- 仍有既有大型工具分包超过 500 kB 的构建提示；本次没有更改告警阈值。

本次版本号与部署配置不变，未部署、未提交或推送 GitHub。

## 第二批（2026-10-23）

按用户“继续补充适合的工具”选择再增加四项，保留已有六项。

| 工具 / 路径 | 选型与能力 | 处理边界 |
| --- | --- | --- |
| 单位换算 `/unit-converter` | 复用 [Math.js](https://github.com/josdejong/mathjs) 的固定单位转换和 BigNumber，11 类、40 位内部精度，显示最多 20 位；不执行输入表达式 | 区分十进制和二进制数据容量；卡路里使用热化学定义 4.184 J，节为 1852 米/小时；温度拒绝低于绝对零度 |
| 图片调色与滤镜 `/image-adjuster` | 对比 [glfx.js](https://github.com/evanw/glfx.js) 的 WebGL 方案后，选择复用本项目栅格 Worker 独立实现亮度、对比度、饱和度、冷暖、黑白、反色及七个预设；不增加另一套图像引擎 | 预览长边 1280px，250ms 合并连续调节，旧处理可取消；导出原尺寸 PNG 并保留透明通道；遵循现有像素和工作空间预算 |
| 图片 DPI 修改 `/image-dpi` | 调研 [changeDPI](https://github.com/shutterstock/changeDPI) 后，不直接使用其针对 Canvas 头部偏移的假设；独立按 PNG/JPEG 结构修改元数据，无像素重编码 | 100 MB 文件；1–65535 DPI；PNG 同步 pHYs/eXIf 并更新 CRC；JPEG 同步 JFIF/EXIF，缺少 JFIF 时补入。保留压缩像素、ICC 和方向；打印尺寸不代表增加细节 |
| 视频截图与取帧 `/video-capture` | 复用 [Mediabunny](https://github.com/Vanilagy/mediabunny) CanvasSink，单张或区间均匀取帧；PNG/JPEG、ZIP 与请求/实际时间清单；批量按递增时间一次解码 | 文件 2 GB，最多 200 张；按显示尺寸保留旋转后的比例，最长边可选原图/3840/1920/1280/640；Canvas 池大小 1，输出预算桌面 512 MiB、受限设备 256 MiB；不解码器支持时明确报错 |

第二批没有新增 npm 依赖。图片 DPI 不解码像素，因此只受输入字节及结构保护约束；异常元数据或超过 10 万结构段的文件会拒绝处理，避免损坏图片或阻塞浏览器。PNG/JPEG 压缩数据使用原始字节保留。

第二批检查时发现原有 Next.js / DOMPurify 的新增安全公告，已额外升级至 16.4.2 / 3.4.17，`npm audit --audit-level=low` 恢复为 0 项已知漏洞；没有增加新包。详见 [依赖审计](dependency-audit.md)。

第二批最终验证（安全升级后）：

- `npm run check` 通过：ESLint、TypeScript、生产构建和全部 390 项测试，0 失败、0 跳过。第二批新增 17 项回归，合计两批新增 36 项。
- 85 条页面源路径通过生产 Worker 渲染检查（包含旧计算器路径兼容跳转）；首页既有搜索、分类和收藏回归继续通过。
- 单位换算覆盖 11 类全部选项、温度偏移、二进制容量和数值边界；图片调色验证像素、透明通道和实际构建出的 Worker 转移，旧通道打包功能回归通过。
- 真实 PNG/JPEG 样本验证重复修改 DPI、EXIF 大小端/厘米单位、PNG pHYs/eXIf 同步、压缩像素字节、方向及 ICC 保留；测试不会修改原输入。
- 视频取帧在受控媒体适配器下验证时间轴偏移、采样区间、比例、单张/ZIP/时间清单、无轨道、不支持解码、空帧、取消和输入释放。未完成真实浏览器解码、实机音频或触控视觉验收；这些不能由 Node 适配器测试代替。
- `npm audit --audit-level=low` 与 `git diff --check` 通过；0 项已知依赖漏洞。
- 构建中新增单位引擎约 231 kB，按需加载；图片调色页面约 4.5 kB，DPI 页面约 7.4 kB，视频取帧页面约 8.0 kB。这些是本地压缩前产物大小，不是网络速度或真机性能测量。

本地浏览器视觉权限限制仍然存在，未绕过限制。网站版本维持 1.0.2；后续发布记录如下。

## 部署记录（2026-10-23）

按用户“部署”要求，通过 `wrangler deploy --keep-vars` 发布主站 `eason-video-toolbox-public`，地址为 https://tool.easonzhan.xyz/ 。Cloudflare 版本 ID：`e8efe0a6-e189-4d76-a20c-0b496ac8357d`。

- 十个新增工具和安全依赖修复均已上线；130 个新/变更静态资源上传成功。网站版本为 1.0.2，页脚构建日期为 2026.10.23。
- 首页十项入口、站点地图及全部十个新工具页面返回 200，关键表单与标题核验通过。
- 十三个页面/引擎脚本、两个许可证、主样式及两个 Worker 的 SHA-256 与本地测试过的构建产物一致。
- 下载并校验的线上正则 Worker 实际完成 Unicode 索引与命名捕获；线上栅格 Worker 实际完成反色并保留透明通道。
- 保留 D1、Images、Rate Limiting 和 Assets 绑定；未部署两个视频 API Worker，未修改版本号、GitHub Release，也未提交或推送 GitHub。

上线检查为 HTTP、资源校验和脚本级运行测试，不替代桌面/手机真实浏览器、触控、声音或视频解码验收。

## 第三批（2026-10-23）

继续补充四项与已有工具不重复的日常功能，仍不移植 PC-TOOL 源码。

| 工具 / 路径 | GitHub 选型与能力 | 处理边界 |
| --- | --- | --- |
| 文本编码与解码 `/text-codec` | [entities](https://github.com/fb55/entities) 8.1.0，BSD-2-Clause，解析完整 HTML 实体；UTF-8/Base64、Base64URL、URL 参数、表单参数、Unicode 转义使用标准平台 API 和独立校验 | 严格 UTF-8、规范填充位与代理字符检查；URL 参数明确区别于整条网址；不执行 HTML、脚本或任意转义；编码不是加密 |
| 汉字转拼音 `/text-pinyin` | [pinyin-pro](https://github.com/zh-lx/pinyin-pro) 3.29.5，MIT，无运行时依赖；声调符号/数字/无声调/首字母、分隔、大写、姓氏模式，保留换行 | 20 万字符；人名、生僻字及多音字须人工核对；姓氏优先仅用于每行开头 |
| CSV / JSON 表格转换 `/table-converter` | 复用 [Papa Parse](https://github.com/mholt/PapaParse) 5.7.0 的 CSV/TSV 解析、引用与导出；JSON 支持对象数组或等宽二维数组 | CSV 值保留字符串；重复/空表头、混合嵌套、行宽错误、超安全整数明确报错。异构对象取字段并集，缺少字段填 null；CSV 导出 null 为空，不能保留 JSON 类型信息。默认公式保护，可显式关闭；UTF-8 BOM 可选 |
| 图片转 PDF `/images-to-pdf` | 复用 [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1，MIT；多图排序/移除、A4/A5/Letter/图片比例、自动方向、边距、DPI、JPEG/PNG、可选缩图 | 独立 Worker 顺序解码、归一化 EXIF 方向并释放位图；每张一页、完整适配不裁切；PNG 保留透明通道，纸张白底。需要 createImageBitmap / OffscreenCanvas，不支持时明确报错 |

两个新增包锁定精确版本；entities 原先存在于间接依赖，此次显式声明所用版本。拼音词库、实体与 PDF 引擎只由文件 Worker 对应操作动态加载；首页及轻量界面不预加载词库或 PDF 引擎。原始许可证与既有 Papa Parse 许可证由构建脚本复制分发。页面样式复用现有响应式单/双栏与主题变量。

本批不部署、不推送、不修改网站版本或 Release。浏览器预览仍受已保存权限限制，不绕过限制，也不将脚本测试描述为真机视觉验收。

第三批最终验证：

- `npm run check` 通过：ESLint、TypeScript、生产构建、408 项测试，0 失败、0 跳过。本批新增 18 项测试，并扩展既有真实文件 Worker 回归。
- 实际构建的文件 Worker 完成中文/Emoji Base64 解码、URL 错误反馈、拼音、CSV 转 JSON；既有差异、JSON、ZIP、PDF 合并与拆分继续通过。
- 真实 PNG/JPEG 嵌入 PDF 后验证页序、尺寸和 PNG 透明遮罩；布局、边距、DPI、取消、错误数据和移动端内存预算均有回归。图片解码使用适配器测试，未实测浏览器 OffscreenCanvas、EXIF 方向或移动设备，不将 PDF 结构测试等同于浏览器解码验收。
- CSV 测试覆盖长编号、前导零、中文、引号、字段内换行、BOM、公式保护、危险字段名、异常表头与结构；编码覆盖 Unicode 代理字符、严格 UTF-8、Base64 填充位及 URL/表单差别；输入超限明确拒绝，不静默截断。
- 交互逻辑测试覆盖选项传递、导入限制、清除旧输出、图片自然排序/移动/删除/导出顺序，及 Worker 进度、取消、超时和加载错误清理；未完成真实桌面/手机视觉验收。
- 新增页面脚本原始大小约为编码 2.1 kB、拼音 2.9 kB、表格 3.7 kB、图片转 PDF 5.4 kB；处理模块位于独立 Worker，拼音约 288 kB、实体编解码约 40 kB、表格约 22 kB。这是本地构建大小，并非网络/真机性能测量。原有超过 500 kB 的大型分包提示仍存在，未调整阈值。
- 新增库及 Papa Parse 的许可证文本与 npm 原始内容逐字一致；`npm audit --audit-level=low` 为 0 项已知漏洞，`git diff --check` 通过。

## 第四批（2026-10-23）

继续补充四个不重复功能；没有恢复已移除的精灵图切割与合成、快手解析或网易云第三方服务。

| 工具 / 路径 | GitHub 选型与实现 | 边界与理由 |
| --- | --- | --- |
| PDF 转图片与文字 `/pdf-export` | 复用 [Mozilla PDF.js](https://github.com/mozilla/pdf.js)（Apache-2.0）的页面绘制和文本层，沿用项目自托管 CMap、字体及 WASM；参考其 [官方示例](https://mozilla.github.io/pdf.js/examples/) | PNG/JPEG、72/144/216/300 DPI、按指定页序导出；单页直接下载、多页 ZIP；不执行 OCR，不导出批注/交互表单层或附件。文字基础行序不是复杂版面重建；无字页面保留页码标记并提示 |
| 图片九宫格与网格切分 `/image-grid` | 调研 [Cropper.js](https://github.com/fengyuanchen/cropperjs) 后，固定网格复用本项目 Canvas 与 fflate，无需额外引入交互裁剪组件；不复制参考源码 | 普通照片切图，不是精灵图工具；完整原图、居中方形裁剪、方形补边；行列编号与坐标清单。整数边界分配余数，不丢弃边缘；PNG 保留透明通道，JPEG 有损且白色补边 |
| YAML / JSON 互转 `/yaml-converter` | [eemeli/yaml](https://github.com/eemeli/yaml) 2.9.1，ISC，无运行时依赖；[官方文档](https://eemeli.org/yaml/) 提供别名、严格字段和类型配置；JSON 语法与重复字段复用 jsonc-parser | YAML 1.2 Core 单文档，支持常规锚点展开；不执行标签。拒绝未知标签、循环/爆炸别名、重复字段、过深结构、非有限数和超安全整数；JSON 不保留注释/锚点/原格式。常规小数使用 JavaScript 精度 |
| 颜色对比度检查 `/color-contrast` | 调研 [contrast-ratio](https://github.com/siege-media/contrast-ratio) 和 [Culori](https://github.com/Evercoder/culori)；本期仅 HEX/sRGB，按 W3C 公式独立实现小型计算，不增加完整颜色引擎、不复制参考源码 | 3/6 位 HEX、文字透明度、实时示例、CSS 导出、普通/大号文字 AA/AAA 与 3:1 比值检查。背景按不透明处理；阈值使用原始值，不先取舍；不能替代整页或组件无障碍审核 |

对比度规则依据 [WCAG 2.2 文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) 与 [非文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)。透明文字先在 sRGB 通道中与背景叠加，再计算相对亮度；不将渐变、图片背景、抗锯齿或交互状态模拟成已验收。

本批只增加 yaml 一个 npm 包，精确锁定版本并附原始 ISC 许可证；其余依赖版本和网站版本号保持不变。首页、分类、搜索、收藏及站点地图均接入新工具。页面复用现有主题和移动断点；处理模块按任务加载，YAML / 图片切分使用可终止文件 Worker，PDF 使用原有 PDF.js 解析 Worker 并在前端顺序绘制。新图片 ZIP 与 PDF 图片打包共享顺序写入及输出预算保护，不一次解码所有切片或页面。

此阶段不部署、不提交、不推送 GitHub，不修改 Release。已保存的浏览器访问限制仍然存在，未绕过；Node Canvas / PDF.js 测试不能视为真实浏览器、移动设备或触控视觉验收。

第四批最终验证：

- `npm run check` 通过：ESLint、TypeScript、生产构建、全站 427 项测试，0 失败、0 跳过；本批新增 19 项，并扩展已有生产文件 Worker 的 YAML 正常及循环引用回归。
- 93 条源页面路径通过生产 Worker 服务端渲染；旧计算器跳转、首页四种布局的搜索与收藏、既有文档与图片工具回归继续通过。
- 使用真实 PDF.js 读取生成的 PDF，验证文字、页码顺序与无字页面；使用 Node Canvas 绘制 PNG，核验页面尺寸、已知色块、单张/ZIP 及页码清单。绘制取消/异常、PDF 销毁与画布释放均覆盖；没有替代浏览器的文字栅格化、字体、CJK 或实机验收。
- 实际网格 PNG 解压后逐像素覆盖并重建原图，透明通道保留；非整除边缘、补边、JPEG 白底、编号和坐标清单正确。取消时不返回部分 ZIP，画布、位图释放；JPEG 边缘允许编码误差，不把有损文件当作无损验证。
- YAML 测试覆盖中文与 Emoji、常规别名、重复字段、未知标签、多文档、循环/爆炸引用、数值范围、原型字段名与深度；真实构建的 YAML Worker 成功转换并拒绝循环数据。
- 对比度验证黑白 21:1、相同色/完全透明 1:1、常用灰色及显示会取舍为 4.500 但实际低于 4.5 的未通过样本。四个界面均有参数、输入变化和旧结果清理逻辑测试；这些不是桌面/手机视觉检查。
- 新页面原始脚本大小约为 YAML 2.7 kB、对比度 4.8 kB、图片网格 6.3 kB、PDF 导出 4.9 kB；PDF 导出引擎约 6.1 kB、YAML Worker 引擎约 100 kB、网格 Worker 引擎约 3.7 kB，均按需加载。这是本地构建大小，不是网络测速或移动设备性能测量。既有超 500 kB 分包提示仍存在。
- yaml 原始 ISC 许可证与构建分发文本完全一致；`npm audit --audit-level=low` 为 0 项已知漏洞，`git diff --check` 通过。没有变更其他 npm 包版本。

## 第五批（2026-10-23）

继续加入四个不重复工具；PC-TOOL 仍只用于功能方向调研，没有复制其源码或素材。

| 工具 / 路径 | GitHub 选型与实现 | 处理边界 |
| --- | --- | --- |
| Cron 表达式预览 `/cron-preview` | [cron-parser](https://github.com/harrisiirak/cron-parser) 5.10.2（MIT），Luxon 处理 IANA 时区，支持五段 / 六段含秒、步长和后续时间迭代 | 只预览，不运行任务；日与周采用 OR，不等同 Quartz。每次重新解析而非 reset，避免上游 [时区重置问题](https://github.com/harrisiirak/cron-parser/issues/406)；拒绝 H 随机字段、年份和 @ 别名。UTC 与本地偏移并列，夏令时与实际平台仍须核对 |
| 文件真实类型识别 `/file-identification` | [file-type](https://github.com/sindresorhus/file-type) 22.2.0（MIT），浏览器二进制签名入口，不依赖 Node 文件系统 | 逐文件仅采样前 64 KiB，无整文件加载；扩展名和系统 MIME 只作比较，不充当检测结果。ZIP/GZIP 不解压，仅报告容器及子类型不确定；不执行、不自动改名、不宣称完整性或安全性 |
| 图片差异对比 `/image-difference` | [Pixelmatch](https://github.com/mapbox/pixelmatch) 8.0.0（ISC），OKLab/HyAB 颜色差异、抗锯齿识别及透明遮罩 | 原尺寸一致才比较，不自动拉伸；白底视觉合成透明像素，不检测隐藏 RGB；红色差异、黄色被忽略的抗锯齿。1280px 缩略预览与原尺寸 PNG 分开，差异像素比例不是语义相似度 |
| 视频裁剪 `/video-trimmer` | 复用 [Mediabunny](https://github.com/Vanilagy/mediabunny)（MPL-2.0）及其 [转换文档](https://mediabunny.dev/guide/converting-media-files)、[ConversionOptions](https://mediabunny.dev/api/ConversionOptions) 的 trim / forceTranscode | 强制重新编码以支持任意区间，MP4 / WebM、可选尺寸与画质；不设置固定帧率，保留可变帧时间。相对首帧区间换算为媒体绝对时间，输出不复制描述元数据。验证主音视频轨均参与转换，避免声音被无提示丢弃；兼容性由 WebCodecs 决定 |

只新增三个精确锁定运行时包，补充它们及相关运行时依赖的原始许可证；视频和现有媒体输出预算不变。四个工具接入首页、分类、搜索、收藏、站点地图和独立页面。处理库按任务动态加载；Cron、文件识别及像素比较在可取消文件 Worker 中执行。

本批不自动部署、提交、推送或修改版本号/Release。沿用既有主题、访问路径和部署方式。已保存的浏览器访问限制未绕过；脚本与 Node Canvas 测试不等同真实桌面、手机或 WebCodecs 编解码验收。

第五批验证记录：

- 补充 18 项回归测试；全站 `npm run check` 的 ESLint、TypeScript、生产构建和 445 项测试通过，0 失败、0 跳过。97 条源页面路径通过生产 Worker 服务端渲染，首页收录 95 个工具；既有布局、搜索与收藏回归继续通过。
- 生产文件 Worker 真正执行 Cron 时区预览、文件头识别、错误反馈及已有 JSON / YAML / 文本差异 / ZIP / PDF 操作；进度消息不当作最终结果。测试发现打包器折叠 debug 依赖的 `typeof window` 探测，造成线程启动时 `window is not defined`，已在现有 Worker 构建插件中保留其运行时探测，不伪造 Window、不改主页面环境。
- Cron 覆盖五段 / 六段、严格晚于起点、OR 日期规则、纽约春秋夏令时、非法日历时间与参数；文件头覆盖真实 PNG/JPEG、PDF/MP4、伪装扩展名、未知文本、ZIP/GZIP 容器和部分失败。20 GiB 模拟源文件仅请求 64 KiB 切片，未整文件读取；这不是 20 GiB 实体文件磁盘测速。
- 图片对比覆盖同图、不同像素、透明白底、抗锯齿开关、阈值、遮罩、尺寸不符及取消；通过 Node Canvas / Sharp 实际解码生成 PNG，验证尺寸、红色像素、透明输出与画布/位图释放。没有将 Node 栅格测试当作浏览器颜色管理或移动端验收。
- 视频测试通过注入媒体适配器核对非零时间起点、区间与格式、可变帧率保留、主音轨参与、初始化/执行失败、取消和清理；未运行真实 WebCodecs 编码、音画同步或移动端播放器测试。浏览器兼容性、帧级边界与真实音画须后续实机验收。
- 页面入口原始脚本约 Cron 3.3 kB、文件识别 2.5 kB、图片差异 4.5 kB、视频裁剪 5.7 kB；对应 Worker 引擎约 100 / 69 / 7.7 kB，视频裁剪控制引擎约 4.4 kB，并复用原媒体包。均按需加载；这是本地构建文件大小，不是网络/设备性能对比数据。既有大分包提示仍存在。
- 新增依赖及相关运行时包原始许可证随构建复制分发；`npm audit --audit-level=low` 为 0 项已知漏洞，`git diff --check` 通过。没有修改网站版本号或线上部署。

## 第六批（2026-10-26）

核对现有 95 个工具后补充四项，不重复已有 IP 查询、颜色格式转换或对比度功能。PC-TOOL 仍只参考功能方向，不复制源码或素材。

| 工具 / 路径 | GitHub 与标准选型 | 处理边界 |
| --- | --- | --- |
| IP / CIDR 子网计算 `/cidr-calculator` | [ipaddr.js](https://github.com/whitequark/ipaddr.js) 2.5.0（MIT）解析 IPv4 / IPv6；网络范围用独立 BigInt 运算，不枚举网段 | 拒绝旧式 IPv4 缩写、整数、十六进制和八进制；不带端口或区域标识。IPv6 数量精确，映射地址不自动变为 IPv4。IPv4 /31 按点到点约定，IPv6 不宣称总数等于可用主机数 |
| URL 解析与参数编辑 `/url-parser` | 调研 [jsdom/whatwg-url](https://github.com/jsdom/whatwg-url)，按 [WHATWG URL 标准](https://url.spec.whatwg.org/) 使用浏览器原生 API，不再打包一套解析器 | 仅 HTTP / HTTPS；只处理文本，不自动访问、存储或校验网站安全。保留重复参数顺序；未编辑时不重写查询串。编辑后的表单编码、IDNA 和路径规范化可能影响原签名；清追踪和账户信息均须显式操作 |
| 渐变色生成器 `/gradient-generator` | [Culori](https://github.com/Evercoder/culori) 4.0.2（MIT），使用 [预乘透明度插值](https://culorijs.org/api/#interpolateWithPremultipliedAlpha)，按函数入口只注册 RGB / OKLab | 2–8 色标、方向、透明度、尺寸，CSS / SVG / PNG；先采样再转为可显示 sRGB，预览与导出共用色标，不宣称等于连续 OKLab 曲线。透明保留，超色域逐通道裁切，SVG 仅生成受控图形节点 |
| CSS 阴影生成器 `/shadow-generator` | 调研 [Neumorphism.io](https://github.com/adamgiebl/neumorphism)（BSD-3-Clause）生成器方向，对照 [MDN 生成器](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Backgrounds_and_borders/Box-shadow_generator) 与 [CSS box-shadow 文档](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-shadow)；本项目不引入独立 React 应用，用已校验颜色与数值独立实现 | 1–6 层、层序、inset、偏移 / 模糊 / 扩展 / 不透明度和圆角，复制 / 下载 CSS。不是透明轮廓 drop-shadow；浏览器决定模糊外观，不复制外部源码、示例代码或界面 |

曾调研 Nzh 作为中文数字转换方案，npm 发布包仅提供 BSD-2-Clause 标识与作者信息，未附完整许可证正文；本期不采用，改选阴影工具，移除相关临时依赖，不复制 Nzh 源码。最终只新增两项直接运行时依赖及开发类型；原始 MIT 许可通过构建脚本分发。

页面沿用现有主题、表单、按钮和 680px 手机断点；URL 参数每页最多 200 项，长 IPv6 与编码字符串可换行。四项均接入分类、搜索、收藏和站点地图。处理只在相应工具页面加载，不改变原路径、动画、部署方式或 1.1.0 版本号；没有部署、提交、推送或改动 Release。

保持已保存的浏览器访问限制，不绕过；Node Canvas / Sharp 的像素验证、Hook 交互和服务端渲染不能替代真实桌面、手机、触控或浏览器色彩管理验收。

第六批最终验证：

- `npm run check` 通过：ESLint、TypeScript、生产构建、全站 467 项测试，0 失败、0 跳过。本批补充 22 项测试，安全版本下限测试同步覆盖 fast-uri / undici / zod 的所有锁定实例。
- 101 条源页面路径通过生产 Worker 服务端渲染，首页共 99 个工具；四种首页布局在 390px / 1440px 的搜索与收藏逻辑回归仍通过。这些是脚本参数与渲染检查，不是真实设备视觉验收。
- IPv4 测试覆盖网络、广播、掩码、/0、/31、/32 和归属；IPv6 覆盖压缩 / 完整表示、/0、/64、/128、128 位精确数量、不同地址族与不规范输入。没有扫描网段或发起网络请求。
- URL 测试覆盖相对路径、IDNA、默认端口、原编码保留、重复键 / 空值 / 加号 / 异常 UTF-8、显式清理、原型字段名、脚本 / 本地协议拒绝与容量边界；参数顺序不依赖对象字段枚举。
- 渐变用真实 Node Canvas 编码 PNG、Sharp 栅格化所生成 SVG，验证原尺寸、方向、透明度与逐通道误差不超过 3；同时验证 RGB / OKLab 中点、预乘透明度、窄色标保留、输入不可变、取消、错误清理和移动端预算。没有把 Node 色彩/采样结果当作浏览器色彩管理一致性保证。
- 四个页面的参数更新、旧结果清理、错误提示、图层顺序及 PNG 导出参数有 Hook 交互回归。阴影没有真实浏览器模糊视觉对照；移动端新页面也未截图验收。
- 页面入口原始脚本约子网 5.4 kB、URL 6.9 kB、渐变 22.8 kB、阴影 4.0 kB，不含已有共享分包；Culori 仅注册所需颜色空间。这里是构建文件大小，未提供浏览器加载时间或设备性能改进对比；既有超过 500 kB 的分包提示仍存在。
- ipaddr.js / Culori 的构建分发许可证与 npm 原始文本完全一致；`npm audit --audit-level=low` 为 0 项已知漏洞，`git diff --check` 通过。网站版本号保持 1.1.0，未部署、提交或推送 GitHub。

## 第七批：ToolKnit 功能方向（2026-10-26）

用户批准新增六项浏览器本地工具。先检查 [ZihangDong/toolknit-desktop](https://github.com/ZihangDong/toolknit-desktop) 的 README、NOTICE、许可证和运行环境：作者代码受 PolyForm Noncommercial / 项目授权边界约束，PDF-to-Word 引擎另有源代码查看条款；没有克隆、运行或复制其源码与资源，也没有把它整体移植到网站。只采用功能方向，实际复用已有宽松许可引擎或独立实现。

| 工具 / 路径 | 实际选型 | 功能与边界 |
| --- | --- | --- |
| PDF 加页码 `/pdf-page-numbers` | [PDF-lib](https://github.com/Hopding/pdf-lib)（MIT）与其 [fontkit 适配](https://github.com/Hopding/fontkit)，复用项目内 OFL 中文字体；[PDFPage API](https://pdf-lib.js.org/docs/api/classes/pdfpage) | 指定页序连续编号、模板、六个位置、字号、边距、颜色和不透明度；不重排页。ASCII 不请求中文字体，中文按需加载并嵌入子集；不支持的字形、放不下或非标准 UserUnit 明确报错 |
| PDF 页面裁剪 `/pdf-cropper` | PDF-lib 的 MediaBox / CropBox，PDF.js 单页预览 | 按可见区域和旋转方向裁去四边百分比，未选页不改；不删除隐藏内容，不能用作脱敏。原文件不覆盖，签名可能失效 |
| 图片指定颜色替换 `/image-color-replace` | 复用栅格 / 位图 / PNG 与可取消 Worker，独立 RGB 距离和混合，不增加图像框架 | 点击原图按像素坐标取色、可见标记、容差、柔化、强度；原尺寸 PNG 保留 alpha。不是区域识别或感知色差模型，同色区域都会参与，导出不保留元数据 |
| 提词器 `/teleprompter` | 调研 [manifestinteractive/teleprompter](https://github.com/manifestinteractive/teleprompter) 的功能方向；独立 RAF / DOM 滚动实现 | 稿件、速度、字号、暂停、镜像、全屏、局部快捷键、后台暂停；只保留页面内存，不自动存储稿件。单帧追赶有上限，旧回调不可继续滚动 |
| PPTX 图片与文字提取 `/pptx-extractor` | [fflate](https://github.com/101arrowz/fflate)（MIT）与 [saxes](https://github.com/lddubeau/saxes)（ISC）；参考 [Microsoft PresentationML 结构](https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document) | 按 presentation 关系顺序提取正文，原始图片、TXT、清单和 ZIP；支持标准 / 严格命名空间，不按文件名猜页序。只读取包内图片，不执行 SVG / 宏，不获取外部资源，不重建版式、不提取备注或 OCR |
| 打字速度测试 `/typing-test` | 调研 [Monkeytype](https://github.com/monkeytypegame/monkeytype) 的功能方向；独立状态机和 Unicode 字素分段，不复制代码 / 词库 | 中英文自写例文、自定义、限时、逐位差异、准确率、字符 / 分、WPM；组合输入确认后计入。退格可修正准确率，非总击键统计或防作弊认证，离开页面不保存成绩 |

页码、裁切、PPTX、颜色处理在现有可终止文件 Worker 中动态加载；PDF 只绘制单页，替换图片只缩略预览，原始下载保持尺寸。提词器 / 打字直接使用平台时钟，隐藏页分别暂停 / 继续限时，文案明确区别。四种首页布局、搜索、分类、收藏和站点地图接入，不改变既有路径、动画、风格或部署方式。

新增依赖精确锁定，不复制受限参考项目。saxes 原始 ISC 全文及 xmlchars 许可随构建分发；fontkit npm 包缺独立 LICENSE，保留其原始 MIT 声明、README、元数据和带内嵌归属的完整原 ES 文件，细节见 [第三方声明](../THIRD_PARTY_NOTICES.md) 与 [依赖审查](dependency-audit.md)，不宣称所有上游许可文字已经完整无缺。

浏览器访问限制仍保留，没有绕过；Node PDF.js / Canvas、Hook 状态及生产 Worker 脚本测试不代表真实桌面 / 手机视觉、触控、字体或全屏兼容验收。本批不部署、不提交、不推送、不修改 1.1.0 版本或 Release。

第七批最终验证：

- `npm run check` 通过：ESLint、TypeScript、生产构建、493 项测试，0 失败 / 跳过。本批新增 26 项回归，并扩展真实生产文件 Worker 的页码、中文字体、裁切、PPTX 和兼容错误分支。
- 107 条源页面路径通过生产 Worker 服务端渲染，首页共 105 个工具；390px / 1440px 下四种首页布局的搜索与收藏逻辑回归继续通过。这是参数 / 渲染测试，不是真实浏览器的尺寸或视觉验收。
- 真实 PDF-lib / PDF.js 验证非零原点、CropBox / MediaBox、四种旋转、指定范围、连续编号、原内容保留、中文字体子集、文本提取和 Node Canvas 栅格化。恢复裁切后仍可读取隐藏文字，证实不能用于安全脱敏。中文子集有 PDF.js 字体类型识别警告，样本可提取 / 绘制；未验证所有阅读器，不忽略为“跨平台字体已通过”。
- PPTX 测试覆盖普通 / 严格命名空间、非顺序文件名、关系页序、段落 / CDATA / 表格、空白页、原始图片与 ZIP 清单；覆盖 DTD / XXE、无效编码 / UTF-16、XML 深度 / 体积、坏根元素、外部关系、宏类型、路径越界、CRC 与中途取消。原始 SVG 仅下载不执行，不宣称资源本身安全。
- 颜色替换验证精确 / 容差 / 柔化 / 强度、半透明和不可变输入；实际 PNG 解码核对原尺寸、坐标取色、输出像素和所有画布 / 位图释放。没有替代浏览器色彩管理或移动触控验收。
- 打字覆盖 Unicode 字素 / NFC / Windows 换行、退格、准确率 / CPM / WPM、输入法确认后计时、截止拒绝迟到输入、重置隔离旧回调、粘贴 / 拖放提示与计时清理。提词器覆盖帧间隔 / 追赶上限、手动滚动、停止 / 末尾、后台暂停、输入不拦快捷键、换稿归零和全屏拒绝；不是移动端全屏兼容保证。
- 页面入口原始分包约 PDF 页操作共享 7.9 kB、图片换色 4.3 kB、PPTX 3.2 kB、提词器 5.2 kB、打字 7.5 kB，不含既有共享包。Worker 页操作 / 图片 / PPTX 引擎约 5.4 / 3.0 / 33.9 kB；中文 fontkit 额外约 756.5 kB，仅非 ASCII 页码触发，字体资源同源按需加载。新增字体包也超过 500 kB，构建提示如实保留；不是网络测速或加载时间改善数据。
- 构建分发的 saxes 全文、xmlchars、fontkit 原始声明 / 元数据 / 归属材料与对应源文件一致；fontkit 独立许可文件缺失仍已注明，不能把本次归档当作完整法律审查。`npm audit --audit-level=low` 为 0 项已知漏洞，`git diff --check` 通过。
