import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the multifunction toolbox homepage with internal and third-party tools", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>多功能工具箱<\/title>/i);
  assert.match(html, /aria-label="搜索工具"/);
  assert.match(html, /placeholder="搜索工具"/);
  assert.doesNotMatch(html, /共27个工具|找到\d+个工具/);
  assert.match(html, /href="\/douyin"/);
  assert.match(html, /href="\/bilibili"/);
  assert.match(html, /href="\/kuaishou"/);
  assert.match(html, /href="\/color"/);
  assert.match(html, /href="\/video-to-gif"/);
  assert.match(html, /href="\/video-to-audio"/);
  assert.match(html, /href="\/video-converter"/);
  assert.match(html, /href="\/video-compressor"/);
  assert.match(html, /href="\/video-reverser"/);
  assert.match(html, /href="\/audio-converter"/);
  assert.match(html, /href="\/audio-compressor"/);
  assert.match(html, /href="\/audio-reverser"/);
  assert.match(html, /href="\/image-watermark"/);
  assert.match(html, /href="\/image-converter"/);
  assert.match(html, /href="\/image-compressor"/);
  assert.match(html, /href="\/image-base64"/);
  assert.match(html, /href="\/images-to-gif"/);
  assert.match(html, /href="\/image-stitcher"/);
  assert.match(html, /href="\/image-cropper"/);
  assert.match(html, /图片与Base64互转/);
  assert.match(html, /多张图片合成GIF/);
  assert.match(html, /图片拼接/);
  assert.match(html, /图片裁剪/);
  assert.match(html, /href="\/image-line-redraw"/);
  assert.match(html, /href="\/ascii-art"/);
  assert.match(html, /href="\/fancy-text"/);
  assert.match(html, /href="\/sensitive-redactor"/);
  assert.match(html, /href="\/ip-lookup"/);
  assert.match(html, /href="\/background-remover"/);
  assert.match(html, /href="\/qr-code"/);
  assert.match(html, /href="\/qr-reader"/);
  assert.match(html, /href="\/file-hash"/);
  assert.match(html, /文件哈希计算/);
  assert.ok(html.includes('href="/document-converter"'));
  assert.ok(html.includes("Word与PDF互转"));
  assert.match(html, /href="https:\/\/wyapi\.toubiec\.cn\/"/);
  assert.match(html, /抖音视频解析/);
  assert.match(html, /B站视频解析/);
  assert.match(html, /快手视频解析/);
  assert.match(html, /颜色格式转换/);
  assert.match(html, /视频转GIF/);
  assert.match(html, /视频提取音频/);
  assert.match(html, /视频格式转换/);
  assert.match(html, /视频压缩/);
  assert.match(html, /视频倒放/);
  assert.match(html, /音频格式转换/);
  assert.match(html, /音频倒放/);
  assert.match(html, /图片加水印/);
  assert.match(html, /图片格式转换/);
  assert.match(html, /图片压缩/);
  assert.match(html, /图片等宽线条重绘/);
  assert.match(html, /ASCII字符画生成/);
  assert.match(html, /花体字转换器/);
  assert.match(html, /敏感内容打码/);
  assert.match(html, /IP地址查询/);
  assert.match(html, /智能抠图/);
  assert.match(html, /二维码生成/);
  assert.match(html, /二维码解析/);
  assert.match(html, /网易云音乐无损解析（第三方）/);
  assert.doesNotMatch(html, /前往|EASON'S TOOLBOX|<small/);
  assert.doesNotMatch(html, /tool-mark|进入工具/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
  assert.doesNotMatch(html, /href="\/youtube"|YouTube视频解析/);
  assert.doesNotMatch(html, /更新日志|changelog/i);
  assert.match(html, /aria-label="打开设置"/);
  assert.match(html, /aria-label="爱发电支持作者"/);
  assert.doesNotMatch(html, /本站累计访问次数|访客计数/);
});

test("图片Base64页面初始显示双向转换、预览和输出格式", async () => {
  const response = await render("/image-base64");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const text of ["图片与Base64互转工具", "图片 → Base64", "Base64 → 图片", "图片预览", "Base64输出", "Data URL（含前缀）", "纯Base64", "复制完整编码", "下载TXT", "最大10 MB"]) assert.ok(html.includes(text), text);
  assert.match(html, /aria-label="生成的Base64编码" readOnly=""/i);
  assert.match(html, /class="convert-button" disabled=""/);
  assert.doesNotMatch(html, /不会上传|浏览器本地运行/);
});

test("多张图片合成GIF页面初始显示排序、设置和预览", async () => {
  const response = await render("/images-to-gif");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const text of ["多张图片合成GIF工具", "图片顺序", "合成设置", "每帧停留时间", "最大输出宽度", "完整显示", "铺满裁剪", "循环播放", "开始合成GIF", "GIF预览", "至少选择2张图片"]) assert.ok(html.includes(text), text);
  assert.match(html, /multiple=""/);
  assert.match(html, /disabled="">开始合成GIF/);
  assert.doesNotMatch(html, /不会上传|浏览器本地运行/);
});

test("图片拼接页面初始显示排序、完整设置和预览", async () => {
  const response = await render("/image-stitcher");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const text of ["图片拼接工具", "图片顺序", "拼接设置", "纵向拼接", "横向拼接", "统一宽度", "保持原尺寸", "图片间距", "外边距", "图片对齐", "透明", "自定义颜色", "输出格式", "开始拼接", "拼接预览", "至少选择2张图片"]) assert.ok(html.includes(text), text);
  assert.match(html, /multiple=""/);
  assert.match(html, /disabled="">开始拼接/);
  assert.doesNotMatch(html, /不会上传|浏览器本地运行/);
});

test("图片裁剪页面初始显示完整裁剪设置和结果占位", async () => {
  const response = await render("/image-cropper");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const text of ["图片裁剪工具", "选择图片", "裁剪预览", "裁剪设置", "裁剪比例", "自由", "1:1", "16:9", "精确裁剪区域", "旋转与翻转", "输出格式", "完成裁剪", "裁剪结果", "尚未选择图片"]) assert.ok(html.includes(text), text);
  assert.match(html, /disabled="">完成裁剪/);
  assert.doesNotMatch(html, /不会上传|浏览器本地运行/);
});

test("文档互转页面初始显示方向、预览、设置和兼容性说明", async () => {
  const response = await render("/document-converter");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const text of ["Word与PDF互转工具", "转换方向", "Word → PDF", "PDF → Word", "转换预览", "转换设置", "纸张大小", "页面方向", "等待转换", "最大20 MB", "DOCX"]) assert.ok(html.includes(text), text);
  assert.match(html, /disabled="">开始转换/);
  assert.doesNotMatch(html, /不会上传|浏览器本地运行/);
});

test("音频压缩页面初始显示预览、设置和结果占位", async () => {
  const response = await render("/audio-compressor");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const text of ["音频压缩工具", "原音频", "压缩结果", "压缩设置", "MP3", "M4A", "OGG", "音频码率", "采样率", "声道", "预计大小", "等待压缩"]) assert.ok(html.includes(text), text);
  assert.match(html, /disabled="">开始压缩/);
  assert.doesNotMatch(html, /不会上传|浏览器本地运行/);
});

test("文件哈希页面初始显示算法、结果占位与比对输入", async () => {
  const response = await render("/file-hash");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /文件哈希计算工具/);
  for (const text of ["MD5", "SHA-1", "SHA-256", "SHA-512", "计算结果", "哈希值比对", "选择文件并开始计算"]) assert.ok(html.includes(text));
  assert.match(html, /type="checkbox" checked=""/);
  assert.match(html, /disabled="">开始计算/);
  assert.doesNotMatch(html, /不会上传|浏览器本地运行/);
});

const toolPages = [
  [
    "/douyin",
    "抖音视频解析",
    "douyin-api",
    "将抖音分享链接转换成可直接播放或下载的无水印视频链接。",
  ],
  [
    "/bilibili",
    "B站视频解析",
    "bilibili-api",
    "将B站分享链接转换成可直接播放或下载的视频链接。",
  ],
  [
    "/kuaishou",
    "快手视频解析",
    "kuaishou-api",
    "将快手分享链接转换成可直接播放或下载的无水印视频链接。",
  ],
];

for (const [path, title, apiHost, description] of toolPages) {
  test(`renders independent tool page ${path}`, async () => {
    const response = await render(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(title));
    assert.match(html, new RegExp(description));
    assert.match(html, /VRChat视频播放器可使用哦/);
    assert.match(html, new RegExp(`https://${apiHost}\\.easonzhan\\.xyz/\\?url=`));
    assert.match(html, /多功能工具箱/);
    assert.match(html, /class="share-field-label"/);
    assert.match(html, /aria-controls="share-text"/);
    assert.match(html, /粘贴[^"<>]*分享链接/);
    assert.doesNotMatch(html, /page-mark/);
    assert.doesNotMatch(html, /在线工具/);
  });
}

test("renders the independent color conversion tool", async () => {
  const response = await render("/color");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /颜色格式转换工具/);
  assert.match(html, /HEX/);
  assert.match(html, /RGB/);
  assert.match(html, /HSL/);
  assert.match(html, /HSV/);
  assert.match(html, /CMYK/);
  assert.match(html, /输入格式/);
  assert.match(html, /HSV 同时支持 HSB 写法/);
  assert.match(html, /多功能工具箱/);
});

test("renders the local video to GIF tool", async () => {
  const response = await render("/video-to-gif");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /视频转GIF工具/);
  assert.match(html, /截取视频片段并转换为GIF/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /选择视频/);
  assert.match(html, /视频预览/);
  assert.match(html, /开始时间/);
  assert.match(html, /转换为GIF/);
  assert.match(html, /GIF预览/);
  assert.match(html, /GIF会显示在这里/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the local video audio extractor", async () => {
  const response = await render("/video-to-audio");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /视频提取音频工具/);
  assert.match(html, /提取视频中的音频并导出WAV/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /选择视频/);
  assert.match(html, /提取音频/);
  assert.match(html, /视频预览/);
  assert.match(html, /采样率/);
  assert.match(html, /音频预览/);
  assert.match(html, /音频会显示在这里/);
  assert.match(html, /最大300 MB/);
  assert.match(html, /WAV/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the local video compressor", async () => {
  const response = await render("/video-compressor");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /视频压缩工具/);
  assert.match(html, /调节画质、分辨率和帧率压缩视频/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /选择视频/);
  assert.match(html, /最大300 MB/);
  assert.match(html, /视频预览/);
  assert.match(html, /最大分辨率/);
  assert.match(html, /压缩质量/);
  assert.match(html, /压缩结果/);
  assert.match(html, /压缩后的视频会显示在这里/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the local video format converter with all settings visible", async () => {
  const response = await render("/video-converter");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const text of ["视频格式转换工具", "转换视频格式并调整画面大小、帧率与画质", "选择视频", "原视频预览", "目标格式", "MP4", "WebM", "MOV", "MKV", "转换设置", "输出分辨率", "输出帧率", "输出画质", "保留视频声音", "转换结果", "转换后的视频会显示在这里", "最大500 MB"]) assert.ok(html.includes(text), text);
  assert.match(html, /disabled="">.*转换为MP4/s);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传|在线工具/);
});

test("renders the local audio format converter", async () => {
  const response = await render("/audio-converter");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /音频格式转换工具/);
  assert.match(html, /转换音频格式并调整采样率、声道与码率/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /选择音频/);
  assert.match(html, /支持MP3、WAV、M4A\/AAC、OGG、Opus、FLAC、WebM等格式/);
  assert.match(html, /音频预览/);
  assert.match(html, /目标格式/);
  assert.match(html, /转换设置/);
  assert.match(html, /转换结果/);
  assert.match(html, /转换后的音频会显示在这里/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the audio and video reversal tools", async () => {
  const audioResponse = await render("/audio-reverser");
  assert.equal(audioResponse.status, 200);
  const audioHtml = await audioResponse.text();
  for (const text of ["音频倒放工具", "选择音频", "原音频", "倒放结果", "倒放后的音频", "开始音频倒放", "多功能工具箱"]) assert.ok(audioHtml.includes(text), text);
  assert.match(audioHtml, /disabled="">.*开始音频倒放/s);

  const videoResponse = await render("/video-reverser");
  assert.equal(videoResponse.status, 200);
  const videoHtml = await videoResponse.text();
  for (const text of ["视频倒放工具", "选择视频", "原视频", "倒放结果", "倒放后的视频", "倒放设置", "输出清晰度", "输出帧率", "同时倒放声音", "开始视频倒放", "多功能工具箱"]) assert.ok(videoHtml.includes(text), text);
  assert.match(videoHtml, /disabled="">.*开始视频倒放/s);
});

test("renders the fancy text converter with the requested double-struck style", async () => {
  const response = await render("/fancy-text");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const text of ["花体字转换器", "输入文字", "双线体", "𝔼𝕒𝕤𝕠𝕟", "数学粗体", "粗斜体", "无衬线粗体", "圆圈字", "复制", "多功能工具箱"]) assert.ok(html.includes(text), text);
});

test("renders the local image watermark tool", async () => {
  const response = await render("/image-watermark");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /图片加水印工具/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /为图片添加文字或图片水印/);
  assert.match(html, /选择原图/);
  assert.match(html, /最大25 MB/);
  assert.match(html, /支持单点水印、平铺水印与网格水印/);
  assert.match(html, /实时预览/);
  assert.match(html, /水印设置/);
  assert.match(html, /尚未选择图片/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the local image format converter", async () => {
  const response = await render("/image-converter");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /图片格式转换工具/);
  assert.match(html, /支持批量转换PNG、JPG和WebP格式/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /选择多张图片/);
  assert.match(html, /单张最大25 MB/);
  assert.match(html, /最多20张/);
  assert.match(html, /支持PNG、JPG、WebP、BMP、AVIF等常见格式/);
  assert.match(html, /multiple=""/);
  assert.match(html, /图片列表/);
  assert.match(html, /转换设置/);
  assert.match(html, /开始批量转换/);
  assert.match(html, /下载全部/);
  assert.match(html, /尚未选择图片/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the local batch image compressor", async () => {
  const response = await render("/image-compressor");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /图片压缩工具/);
  assert.match(html, /支持批量压缩JPG、PNG和WebP/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /选择图片/);
  assert.match(html, /压缩质量/);
  assert.match(html, /下载全部/);
  assert.match(html, /单张最大25 MB/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the local equal-width image line redraw tool", async () => {
  const response = await render("/image-line-redraw");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /图片等宽线条重绘工具/);
  assert.match(html, /提取图片轮廓并用统一粗细的线条重绘/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /选择图片/);
  assert.match(html, /重绘预览/);
  assert.match(html, /重绘设置/);
  assert.match(html, /线条粗细/);
  assert.match(html, /轮廓灵敏度/);
  assert.match(html, /线条颜色/);
  assert.match(html, /背景颜色/);
  assert.match(html, /尚未选择图片/);
  assert.match(html, /下载PNG线稿/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the ASCII art generator", async () => {
  const response = await render("/ascii-art");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /ASCII字符画生成工具/);
  assert.match(html, /输入文字，生成粗体方块字、边框与居中副标题/);
  assert.match(html, /输入英文、数字或中文/);
  assert.match(html, /英文和数字使用FIGlet大字/);
  assert.match(html, /字符画预览/);
  assert.match(html, /生成设置/);
  assert.match(html, /横幅字体/);
  assert.match(html, /字符间距/);
  assert.match(html, /粗体方块/);
  assert.match(html, /副标题/);
  assert.match(html, /边框样式/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the local sensitive content redactor", async () => {
  const response = await render("/sensitive-redactor");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /敏感内容打码工具/);
  assert.match(html, /手动涂抹需要隐藏的区域/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /选择图片/);
  assert.match(html, /打码预览/);
  assert.match(html, /打码设置/);
  assert.match(html, /马赛克/);
  assert.match(html, /模糊/);
  assert.match(html, /遮挡/);
  assert.match(html, /下载已打码图片/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the IP address lookup tool", async () => {
  const response = await render("/ip-lookup");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /IP地址查询工具/);
  assert.match(html, /IPv4 或 IPv6/);
  assert.match(html, /查询我的公网 IP/);
  assert.match(html, /查询结果/);
  assert.match(html, /刷新查询结果/);
  assert.match(html, /运营商/);
  assert.match(html, /经纬度/);
  assert.match(html, /多功能工具箱/);
});

test("renders the local smart background remover", async () => {
  const response = await render("/background-remover");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /智能抠图工具/);
  assert.match(html, /IS-Net FP16/);
  assert.match(html, /IS-Net QInt8/);
  assert.match(html, /BEN2 FP16/);
  assert.match(html, /AI 模型/);
  assert.match(html, /选择图片/);
  assert.match(html, /抠图预览/);
  assert.match(html, /抠图设置/);
  assert.match(html, /尚未选择图片/);
  assert.match(html, /选择图片后在这里预览/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /提供IS-Net FP16、QInt8与BEN2 FP16三种本地AI模型/);
  assert.doesNotMatch(html, /本地高精度AI处理/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the local QR code generator", async () => {
  const response = await render("/qr-code");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /二维码生成工具/);
  assert.match(html, /生成支持颜色、Logo与背景图片的二维码/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /二维码预览/);
  assert.match(html, /二维码设置/);
  assert.match(html, /容错级别/);
  assert.match(html, /中心 Logo/);
  assert.match(html, /背景图片/);
  assert.match(html, /透明背景/);
  assert.match(html, /背景图片透明度/);
  assert.match(html, /输入二维码HEX颜色/);
  assert.match(html, /上传 Logo/);
  assert.match(html, /上传背景/);
  assert.match(html, /下载PNG/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});

test("renders the local QR code reader", async () => {
  const response = await render("/qr-reader");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /二维码解析工具/);
  assert.match(html, /支持上传、拖放或粘贴二维码截图/);
  assert.doesNotMatch(html, /浏览器本地处理|不会上传/);
  assert.match(html, /选择二维码图片/);
  assert.match(html, /图片预览/);
  assert.match(html, /解析结果/);
  assert.match(html, /支持上传、拖放或粘贴截图，并可复制解析结果/);
  assert.match(html, /多功能工具箱/);
  assert.doesNotMatch(html, /在线工具/);
});
