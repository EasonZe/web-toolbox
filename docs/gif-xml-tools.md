# GIF 帧提取与 XML 格式化

## 选型

| 工具 | 项目 | 集成方式 |
| --- | --- | --- |
| GIF 帧提取 `/gif-extract` | [gifuct-js](https://github.com/matt-way/gifuct-js) 2.1.2，MIT | 逐帧解码，不使用其演示页渲染代码。按 [GIF89a](https://www.w3.org/Graphics/GIF/spec-gif89a.txt) 独立处理局部帧叠加、透明像素与清除规则，复用 fflate 打包 |
| XML 格式化与校验 `/xml-formatter` | [Prettier](https://github.com/prettier/prettier) 3.9.10、[XML 插件](https://github.com/prettier/plugin-xml) 3.4.2，MIT；复用 [saxes](https://github.com/lddubeau/saxes) 6.0.0，ISC | saxes 先严格检查命名空间、属性、实体与工作预算，通过后才调用 standalone 格式化器；默认 strict 空白规则，重排须显式开启 |

调研过 [gif-frames](https://github.com/benwiley4000/gif-frames)，未引入另一套画布 / 流适配层。gifuct-js 的 [清除规则讨论](https://github.com/matt-way/gifuct-js/issues/35) 表明演示代码不能直接当作完整帧渲染器：清除应发生在当前帧显示之后，且恢复背景只影响该帧矩形。

试用过 [xml-formatter](https://github.com/chrisbottin/xml-formatter) 3.7.0：忽略路径模式仍会裁掉受保护文本的尾部空格。回归样本 `<p>  hello <b>world</b> !  </p>` 未通过内容保留测试，因此移除该依赖及其解析器，未分发其代码。Prettier 的严格模式保留元素内空白；输出仍可能整理属性 / 文档换行，不能用于保留数字签名。

## 处理边界

- GIF：先校验文件头、块长度、色表、局部尺寸和结束标记，再解码。控制块即使被注释或应用扩展隔开也保留；使用每帧局部色表，按原始延迟记录 0 ms，不使用解码库的默认延迟替代。支持清除模式 0–3；纯文本绘制、用户输入要求和未知扩展明确拒绝。2026-10-28 补充有固定字典与工作预算的 LZW 预检，验证字典码、实际像素数、结束码和子块结尾，像素解码仍由 gifuct-js 完成；不宣称覆盖全部 GIF 扩展。
- 按选定结束帧从头顺序还原，再按范围和间隔输出完整 PNG，不将局部 patch 当成完整图片。透明 / 文件背景由用户选择；“透明”是导出背景策略，不等于浏览器显示 GIF 时的背景合成。
- 一次最多读取 2000 帧，导出 200 帧，单文件 100 MiB，画布单边 8192px；沿用 2 亿像素帧工作预算，低内存 / 移动设备减半。PNG 总量桌面 256 MiB、移动 128 MiB，为输出 Blob、ZIP 与压缩缓冲留空间，不自动缩小图像。
- ZIP 使用固定文件名，包含原帧号与标称延迟清单；PNG 已压缩，不再做无收益的 DEFLATE。仅当前帧创建预览链接，换帧 / 清空 / 卸载释放；后台任务可取消，旧导入不可回填。
- XML：最多 500 万字符，沿用 100 层、25 万节点预算；仅 UTF-8，不执行 SVG、样式表或脚本，不请求外部资源。DTD / 自定义实体直接拒绝；校验是良构检查，不是 XSD 或业务校验。
- XML 默认不重排元素内部空白，因此紧凑文档不一定自动展开；开启重排会提示可能改变文本含义。仅校验返回原文；长结果截取预览，复制和下载完整输出。既不自动保存草稿，也不上传文件。

两项工具都在既有可终止文件 Worker 内按需加载，不把解码器或格式化引擎放入首页入口。XML 超时 30 秒，GIF 沿用文件任务时限与进度协议。分类、搜索、收藏、站点地图与既有风格保持一致；发布内容见 [v1.3.0](releases/v1.3.0.md)。

## 依赖分发

新增三个直接依赖：gifuct-js、prettier、@prettier/plugin-xml，均精确锁定。gifuct-js 的 js-binary-schema-parser 为 MIT；XML 插件的 @xml-tools/parser / Chevrotain 为 Apache-2.0、regexp-to-ast 为 MIT。Prettier 的原始许可证及完整 THIRD-PARTY-NOTICES 一并分发，不将其内嵌依赖笼统标作 MIT。saxes / xmlchars 沿用原有声明。原始许可文本由构建脚本复制到 `public/vendor-licenses`，测试与 npm 来源逐字比较。

## 验证范围

回归覆盖 XML 混合文本 / CDATA / 空白、错误行列、实体、预算、UTF-8 与原型同名属性；GIF 的局部帧、透明、背景、清除模式、跳帧、延迟、错误、取消、PNG 像素与 ZIP 清单。生产 Worker 验证真实构建后的按需加载、XML 处理和 GIF 预检；Node Canvas / Sharp 验证生成 PNG，不代表真实浏览器 GIF 播放或移动端触控验收。

沿用已保存的浏览器访问限制，没有绕过。390px / 1440px 首页四种布局的搜索收藏逻辑、响应式样式与服务端渲染可自动检查，但新增页面尚未进行桌面 / 手机截图及实机兼容验收。

上一批检查（2026-10-27）：与同日重复文件 / PDF 扫描件合并验证，lint、TypeScript、生产构建及全站 675 项测试通过，0 失败 / 跳过；npm 审计为 0 项已知漏洞。112 个工具、113 条站点地图 URL 通过一致性检查。GIF / XML 页面入口原始脚本约 4.9 / 3.6 kB，后台引擎约 12.2 / 262.5 kB，不含既有共享包；这是本地构建大小，不是浏览器加载时间对比。原有大分包与路由静态分类提示仍保留。后续合并验证见 [本轮记录](bpm-browser-tools.md#验证结果)。
