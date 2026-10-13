# OCR 模型与资源说明

`eng.traineddata.gz` 和 `chi_sim.traineddata.gz` 来自 [naptha/tessdata](https://github.com/naptha/tessdata)，使用 `@tesseract.js-data/eng` 和 `@tesseract.js-data/chi_sim` 1.0.0 的 `4.0.0_best_int` 文件。

上述语言数据包元数据采用 MIT License；其模型基于 [tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata)（Apache License 2.0）。Tesseract.js 与其 WebAssembly core 均采用 Apache License 2.0，许可证随本目录提供。

发布时 `.traineddata.gz` 的压缩载荷使用 `.traineddata` URL 分发，避免与 HTTP 预压缩侧文件规则冲突；引擎按 gzip 签名解压，模型内容不变。

模型及引擎不由本项目重新训练或修改。首次访问需要从本网站加载资源，不将用户图片发送至任何 OCR 服务。
