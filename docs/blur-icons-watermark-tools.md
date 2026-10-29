# 模糊、应用图标与 PDF 水印

## 来源与选择

| 工具 | 已核实来源 | 与现有工具的区别 |
| --- | --- | --- |
| `/image-blur` 图片模糊 | [PhotoTool 图片模糊](https://phototool.cn/blur/)提供整图模糊和强度调节。 | 现有「敏感内容打码」侧重手绘遮挡；这里提供原图像素半径、强度与矩形范围，导出原尺寸 PNG。本实现一次处理一张，不照搬参考站的批量功能。 |
| `/app-icons` 多尺寸应用图标 | [PhotoTool 多尺寸图标](https://phototool.cn/icon-generator/)提供多平台 PNG 规格与 ZIP 下载。 | 现有 ICO 工具保留原入口；新工具生成 Web / PWA、Apple、Android 传统图标的目录和说明，不是另一个 ICO 封装器。 |
| `/pdf-watermark` PDF 文字水印 | [pdf-lib 官方示例](https://github.com/Hopding/pdf-lib#modify-document)及[文字绘制参数](https://pdf-lib.js.org/docs/api/interfaces/pdfpagedrawtextoptions)支持位置、角度和不透明度。 | 现有 PDF 页码只负责页眉页脚编号；这里增加单个、网格和交错平铺文字水印、页码范围与成品预览。不声称 PC-TOOL 或 ToolKnit 已有独立 PDF 水印工具。 |

仅参考公开功能说明和官方 API，未复制 PhotoTool、PC-TOOL 或 ToolKnit 的实现、界面、文案与素材。[ToolKnit 当前一般源码许可](https://github.com/ZihangDong/toolknit-desktop/blob/main/LICENSE)为 PolyForm Noncommercial，不作为 MIT 项目的代码来源。

## 实现与依赖

- 图片模糊独立实现透明度加权的可分离盒式均值，在专用 Worker 中处理。调研了 [StackBlur](https://github.com/flozz/StackBlur) 的成熟方案，但未复制或引入该库；不将均值模糊称作高斯模糊。
- 应用图标使用标准 Canvas 缩放，复用已有 [fflate](https://github.com/101arrowz/fflate)（MIT）打包；Apple PNG 直接编码 RGB，不只把带透明通道的像素涂白。
- PDF 水印复用已有 [pdf-lib](https://github.com/Hopding/pdf-lib)（MIT）、fontkit、站内中文字体及页面选择、可见区域和旋转坐标，不引入其他 PDF 引擎。

没有新增 npm 依赖，实际直接依赖仍为 95 项；增加 3 个入口后共 124 个工具，站点地图 125 个 URL。已有第三方许可见[第三方声明](../THIRD_PARTY_NOTICES.md)。

## 能力边界

- 图片工具接受本地静态 PNG / JPEG / WebP / AVIF / BMP，不支持 SVG 或动画；解码与画布能力由浏览器提供。模糊使用设备工作空间预算，预览最长边 1280px，下载保持原尺寸；不修改原文件，不保留 EXIF 等原始元数据。
- 模糊只柔化画面，不能保证隐藏信息不可还原或推断，不用于安全脱敏；敏感内容应使用不透明遮盖并核对结果。
- 图标支持完整适配 / 填满裁切、内边距与背景色。Apple 180 / 1024px 为无 alpha 通道的普通 RGB PNG，不预加圆角，不生成 Icon Composer 分层图标、完整 Xcode 资产目录或全部商店提交素材。Android 只有传统 mipmap 位图，不是 adaptive 图标，不包含单色主题图层或商店图。Web 清单只提供名称和相对图标路径，不代表已具备可安装 PWA 的全部条件。
- PDF 水印仅支持文字，不支持图片水印；不处理加密 PDF。水印叠加在原内容上，可被编辑或移除，不是 DRM、防复制或安全脱敏。修改文档可能使数字签名失效。请保留原件；不支持的字符、异常页面及过密水印会明确报错，不静默裁掉文字。
- 中文水印和原有中文页码嵌入完整站内字体。实际对照发现 CFF 子集在「测试 AV 水印」混排时遗漏「水」字轮廓，即使文字仍可提取；完整字体修复后与独立参考逐像素一致，测试输出约 7.34 MB。代价是中文结果通常增加约 7–8 MB，纯英文仍使用内置 Helvetica，不增加该字体体积。

## 验证范围

新增路由测试通过实际生产 Worker 的 Node SSR 入口检查标题和初始控件；检查生成分包中无本地用户绝对路径，并解析 CSS 声明核对 1440px / 390px 对应的分栏、完整标签、触控尺寸与主题变量来源。

这些是 SSR 结构、构建产物和 CSS 规则回归，不执行浏览器布局、点击或触控，不代替真实桌面及手机的视觉验收。测试结果以实际检查输出为准，不据此声称实机性能或跨浏览器功能已经通过。

本批 ESLint、TypeScript、生产构建与全量 881 项测试通过，0 失败、0 跳过。一致性检查为 95 项依赖、124 个工具和 125 条站点地图 URL。专项测试覆盖真实 PNG / ZIP / PDF、独立均值像素参考、Apple RGB 无透明通道、完整中文字体轮廓、页面旋转与裁切坐标、生产 Worker 协议，以及取消、换源和卸载清理。
