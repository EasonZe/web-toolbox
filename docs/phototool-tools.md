# 图片工具补充

## 调研与选择

参考 [PhotoTool 实际工具目录](https://phototool.cn/tools/) 筛选现有工具的缺口。本轮不复制该站实现、文案、样图或其他素材。

| 本项目工具 | 已核实的参考能力 | 与已有工具的区别 |
| --- | --- | --- |
| `/image-rounded` 图片圆角与边框 | [圆角](https://phototool.cn/radius/)、[圆形](https://phototool.cn/circle/)、[边框](https://phototool.cn/border/) | 现有裁剪只有矩形区域和旋转翻转；本工具增加独立四角、圆形透明遮罩和明确尺寸的内外边框。 |
| `/image-canvas` 图片画布与纯色图 | [纯色图片](https://phototool.cn/pure-color/)、[PNG 补底色](https://phototool.cn/png-background/) | 合并底图与补色需求，并自主延伸为可定位、完整适配 / 原尺寸 / 填满裁切的画布工具；不声称参考站已有独立的画布扩展工具。 |
| `/image-duotone` 图片双色调 | [双色调](https://phototool.cn/duotone/) | 现有调色只有亮度、对比度、饱和度、冷暖、灰度、反色；本工具按亮度映射自定义暗亮两色。 |
| `/image-sharpen` 图片锐化 | [锐化](https://phototool.cn/sharpen/) | 增加独立的反差增强参数，不把提高对比度或放大图片称作锐化。 |

压缩、格式转换、裁剪、拼接、取色、水印等已经存在的功能不重复新增入口。自动裁边、联系表等未在本次参考目录直接核实，不列为本批次来自该站的工具。

## 成熟方案与许可证

- 双色调复用已经安装的 [Culori 4.0.2](https://github.com/Evercoder/culori)（[MIT](https://github.com/Evercoder/culori/blob/main/LICENSE)），只注册 sRGB / 线性 sRGB。亮度采用线性 RGB 权重，颜色与强度在线性空间混合；保留原 alpha，0% 保持原始像素。
- 锐化调研了 [glfx.js 的 unsharpMask](https://evanw.github.io/glfx.js/docs/#unsharpMask)（[MIT](https://github.com/evanw/glfx.js/blob/master/LICENSE)）。仅参考反遮罩方法和半径 / 强度的参数思路，不复制 shader 或库代码；本项目自主实现透明度加权的可分离盒式邻域，滑动窗口时间复杂度 O(像素数)。这是盒式反差锐化，不冒称高斯模糊或 AI 修复。未增加旧 WebGL 运行时依赖。
- 圆角和画布调研了 [Fabric.js](https://github.com/fabricjs/fabric.js) 等成熟 Canvas 项目；本轮不需要交互画布对象、拖拽编辑和 SVG 解析，直接使用标准 Canvas 路径、`clip`、`fill`、`drawImage` 和 PNG 编码，不引入整个画布框架。圆角使用 `arcTo`，无需依赖较新的 `roundRect`。

本批次新增 4 个入口，不增加 npm 依赖；直接依赖仍为 95 项，项目入口共 121 个，站点地图 122 个 URL。第三方现有许可继续见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

## 行为边界

- 只接收本地静态 PNG / JPEG / WebP / AVIF / BMP。统一在解码前检查已知 APNG、动画 WebP 和 AVIF `avis` 品牌；不默默丢弃动画后续帧。不是完整图像格式安全扫描，真正解码仍由浏览器处理。
- 四项均输出重新编码的 PNG，不修改原文件，不保留 EXIF 等原始元数据。圆角、边框和画布预览显示真实输出，效果工具的预览为缩略图；下载保留请求的实际像素尺寸。
- 圆形遮罩在原画布中央按短边生成；非正方形画布不会偷偷缩小或拉伸。内框覆盖图内边缘，输出尺寸不变；外框在原图外增加两倍框宽。
- 原尺寸画布不允许小于原图；只有明确选择填满裁切才会裁掉边缘。原尺寸居中取整数像素，奇数留白把额外一像素留在右侧 / 下方，避免半像素模糊；JPEG 按解码后 EXIF 方向计算位置。
- 双色调与锐化放在专用 Worker 中，仅显式生成时处理原尺寸，下载复用结果。调参、重选、清空与卸载取消任务并屏蔽迟到结果。原图只生成最长边 1024 / 1280px 缩略图，避免 HTML 预览重复解码整幅大图。
- 锐化可能增强噪点与光晕，不会找回已经丢失的细节。处理保留 alpha，透明像素的隐藏 RGB 不会把邻近可见像素染黑。
- 圆角、画布使用共享设备内存预算与 8192px 输出边长；源图与输出联合估算。效果工具按算法估算双色调 5 份 RGBA8、锐化 12 份等价缓冲，手机预算 512 MiB、桌面 2 GiB，不新增固定 16 / 32MP 上限。主线程设备判断传给 Worker，与 Worker 本地判断取更严格者，覆盖桌面 UA 的 iPad。

## 验证

新增测试覆盖：真实 Native Canvas / Sharp PNG 像素、独立二维锐化参考、线性双色调端点与混合、透明度、四角 / 圆形 / 内外框、纯色 / 透明 / 三种画布适配、EXIF 方向、奇数留白、取消与资源释放、重选和参数修改的迟到结果、Worker 超时和设备预算。

Node 的 Canvas、Hook 和 Worker 平台适配不是真实浏览器截图或手机触控验收。浏览器检查此前未获许可，本轮没有绕过；真实浏览器和实机视觉仍待检查。保持现有路径、主题和部署方式；发布内容见 [v1.3.0](releases/v1.3.0.md)。

本轮生产构建、完整 lint、TypeScript 与全量 833 项测试通过。项目一致性检查为 95 项实际依赖、121 个工具、122 个站点地图 URL；Cloudflare dry-run 的服务端上传 gzip 为 6,131.95 KiB。dry-run 只验证打包，不等于部署成功；未做加载速度或手机实机性能测量。
