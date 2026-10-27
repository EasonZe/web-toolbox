<p align="center">
  <img src="./public/images/toolbox-logo.png" width="152" alt="多功能工具箱">
</p>

<h1 align="center">多功能工具箱</h1>

<p align="center">瀏覽器裡的實用工具</p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  <a href="./README.zh-TW.md"><strong>繁體中文</strong></a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <a href="https://tool.easonzhan.xyz/"><img alt="Website" src="https://img.shields.io/badge/Website-tool.easonzhan.xyz-0ea5e9"></a>
  <a href="https://github.com/EasonZe/web-toolbox/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/EasonZe/web-toolbox"></a>
  <a href="https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-2563eb"></a>
  <a href="https://github.com/EasonZe/web-toolbox/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/EasonZe/web-toolbox?style=flat&logo=github"></a>
</p>

<p align="center">
  <img alt="Node.js 22+" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white">
  <img alt="100+ tools" src="https://img.shields.io/badge/Tools-100%2B-7c6fb1">
</p>

[線上使用](https://tool.easonzhan.xyz/) · [版本更新](https://github.com/EasonZe/web-toolbox/releases) · [問題回報](https://github.com/EasonZe/web-toolbox/issues)

多功能工具箱收錄 100 多個影片、音訊、圖片、文件、開發與生活工具，無須安裝。多數檔案與文字處理在瀏覽器本機完成。

## 有哪些工具

| 分類 | 常用工具 |
| --- | --- |
| 影片 | 格式轉換、壓縮、裁切、浮水印、轉 GIF、截圖與取幀、影片連結解析 |
| 音訊 | 格式轉換、裁切與拼接、變速變調、倒放、錄音、節拍器 |
| 圖片與設計 | 壓縮、裁切、拼接、OCR、去背、取色、像素畫、貼圖、3D 預覽、CSS 樣式產生 |
| 文字與文件 | 文字編輯與比對、Markdown、字幕、PDF 頁面管理與匯出、PPTX 擷取 |
| 編碼與開發 | JSON、YAML、路徑擷取、雜湊與 HMAC、正規表示式、JWT、QR Code、ZIP、Unity 資源包預覽 |
| 計算與換算 | 運算式、方程、微積分、矩陣、統計、數論、單位與匯率換算 |
| 時間與生活 | 世界時鐘、倒數計時、日期計算、抽籤、打字練習 |
| 裝置與網路 | 麥克風、鍵盤與螢幕測試、IP 查詢、子網計算、短連結 |

支援搜尋、分類、收藏、四種清單版面、深淺色模式與自訂主題色。部分圖片與 PDF 結果可直接交給下一個工具，詳見[工具銜接](docs/tool-workflows.md)。

## 本機執行

需要 Node.js 22.13 或更新版本及 npm。

```bash
git clone https://github.com/EasonZe/web-toolbox.git
cd web-toolbox
npm ci
npm run dev
```

提交前執行檢查：

```bash
npm run check
```

## 部署

使用 Cloudflare Workers。Fork 後請替換 `wrangler.jsonc` 中的網域、資源 ID 與綁定，步驟見[部署文件](docs/deployment.md)。

```bash
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy --keep-vars
```

抖音與 B 站解析使用獨立 Worker，原始碼位於 `workers/`，需要個別部署。

## 使用說明

- 本機處理能力受裝置記憶體與瀏覽器支援影響，詳見[處理範圍](docs/resource-limits.md)。
- 影片解析、匯率、IP 查詢與短連結等功能需要連線。影片內容應由你擁有或已獲使用授權。
- PDF 裁切只隱藏頁面區域，不能用於安全遮蔽；JWT 解析不驗證簽章。

## 文件與參與

[系統架構](docs/architecture.md) · [貢獻指南](CONTRIBUTING.md) · [安全政策](SECURITY.md) · [第三方聲明](THIRD_PARTY_NOTICES.md)

由 [EasonZe](https://github.com/EasonZe) 維護，歡迎提交 Issue 和 Pull Request。

專案程式碼採用 [MIT License](LICENSE)。第三方元件、字型、模型與素材遵循各自授權。
