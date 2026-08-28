# Eason 的工具箱

一个简洁的在线媒体与实用工具集合，使用 Next.js、vinext 和 Cloudflare Workers 构建。

线上地址：<https://tool.easonzhan.xyz>

## 已包含的工具

- 抖音、B站、快手视频解析
- 视频转 GIF、视频提取音频、视频压缩
- 音频格式转换、音频压缩（MP3 / M4A / OGG，可调码率、采样率与声道）
- 图片加水印、图片格式转换、批量图片压缩
- 图片等宽线条重绘、智能抠图、敏感内容打码
- 二维码生成与解析
- ASCII 字符画生成
- 颜色格式转换、IP 地址查询、文件哈希计算（MD5 / SHA-1 / SHA-256 / SHA-512）
- 网易云音乐无损解析（第三方）

## 项目结构

```text
app/                 页面、组件与接口
public/              静态资源和本地 AI 模型
tests/               自动化测试
types/               第三方库类型声明
worker/              Cloudflare Worker 入口及服务端逻辑
wrangler.jsonc       Cloudflare 部署配置
vite.config.ts       vinext 与 Cloudflare 构建配置
```

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

开发服务器启动后，在浏览器打开终端显示的本地地址。

## 检查与构建

```bash
npm run lint
npm test
```

`npm test` 会先执行生产构建，再运行全部自动化测试。

## 部署到 Cloudflare

先登录 Cloudflare，然后执行：

```bash
npx wrangler login
npm run build
npx wrangler deploy --dry-run
npx wrangler deploy --keep-vars
```

自定义域名和 Worker 名称位于 `wrangler.jsonc`。

## 隐私说明

图片、视频和音频处理工具优先在浏览器本地执行。视频解析和 IP 查询等需要联网的功能会访问对应的服务端接口。

## 开源依赖

项目使用的主要开源库包括 React、Next.js、vinext、figlet、Mediabunny、gifenc、QRCode、Transformers.js 和 hash-wasm。完整版本信息见 `package.json`。
