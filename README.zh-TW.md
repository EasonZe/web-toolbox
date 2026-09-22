<p align="center">
  <img src="./public/images/toolbox-logo.png" width="152" alt="多功能工具箱專案標誌">
</p>

<h1 align="center">多功能工具箱</h1>

<p align="center">一個乾淨、響應式、面向正式環境的線上工具集合</p>

<p align="center">
  <a href="./README.md">簡體中文</a> ·
  <a href="./README.zh-TW.md"><strong>繁體中文</strong></a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-2563eb.svg"></a>
  <a href="https://tool.easonzhan.xyz/"><img alt="線上體驗" src="https://img.shields.io/badge/線上體驗-tool.easonzhan.xyz-0ea5e9.svg"></a>
</p>

多功能工具箱以 React、Next.js、vinext 與 Cloudflare Workers 建置，收錄 50 多個影片、音訊、圖片、文件、開發及生活類工具。大多數媒體與文字處理都在瀏覽器本機完成，無須安裝應用程式。

## 功能

- **影片**：連結解析、格式轉換、壓縮、倒放、轉 GIF、擷取音訊及浮水印。
- **音訊**：格式轉換、壓縮、倒放、變速變調、麥克風測試與錄音。
- **圖片與設計**：壓縮、裁切、拼接、浮水印、取色、像素畫、拼豆圖紙、智慧去背、QR Code 和 3D 模型預覽。
- **文字與文件**：純文字編輯、格式轉換、字數統計、ASCII 字元畫、繁簡轉換及 Word/PDF 工具。
- **開發與生活**：檔案雜湊、進位轉換、函數繪圖、摩斯電碼、短連結、匯率、全球時間、日期計算、倒數計時和裝置測試。
- **使用體驗**：搜尋、分類、收藏、四種清單版面、淺色/深色模式、自訂主題色，以及桌面、平板和手機適配。

## 快速開始

需要 Node.js `>= 22.13.0` 與 npm `>= 10`。

```bash
git clone https://github.com/EasonZe/web-toolbox.git
cd web-toolbox
npm ci
npm run dev
```

提交程式碼前請執行完整檢查：

```bash
npm run check
```

## 技術架構

| 層級 | 技術 |
| --- | --- |
| 介面與路由 | React 19、Next.js 16、TypeScript、vinext |
| 建置與部署 | Vite、Cloudflare Workers、Wrangler |
| 雲端能力 | Workers Assets、Images、D1、Rate Limiting |
| 品質保障 | ESLint、Node.js Test Runner、GitHub Actions、Dependabot |

## 影片解析服務

| 平台 | 正式環境 Worker | 主要上游 | 儲存庫狀態 |
| --- | --- | --- | --- |
| 抖音 | `eason-daoyin-api` | 抖音公開頁面與播放位址 | 外部部署相依，未收錄原始碼 |
| Bilibili | `eason-bilibili-api` | Bilibili 官方公開播放介面 | 已收錄原始碼 |
| 快手 | `eason-kuaishou-api` | 第三方解析介面，失敗後回退至快手公開頁面 | 外部部署相依，未收錄原始碼 |

這些端點不是本儲存庫的通用公共 API。Fork 若要完全獨立部署，需要自行提供相容的抖音與快手服務。完整說明請參閱 [系統架構](docs/architecture.md)、[部署文件](docs/deployment.md) 和 [相依套件與上游審查](docs/dependency-audit.md)。

## 部署

主站面向 Cloudflare Workers 部署，需要 Assets、Images、D1 與 Rate Limiting 綁定：

```bash
npm ci
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy --keep-vars
```

Fork 後必須替換 `wrangler.jsonc` 內的生產網域與 Cloudflare 資源，詳見 [部署文件](docs/deployment.md)。

## 隱私、合規與安全

- 使用者檔案優先留在瀏覽器本機；部分網路功能仍會連線至外部服務。
- 影片解析僅應用於你擁有權利或已取得授權的內容，並遵守平台條款及當地法律。
- 安全問題請依照 [安全政策](SECURITY.md) 私下回報。
- 第三方套件與授權見 [第三方聲明](THIRD_PARTY_NOTICES.md)。

## 參與專案

本專案由 [EasonZe](https://github.com/EasonZe) 發起並維護。歡迎提交 Issue 與 Pull Request；請先閱讀 [貢獻指南](CONTRIBUTING.md) 和 [行為準則](CODE_OF_CONDUCT.md)。

## 授權

專案程式碼採用 [MIT License](LICENSE)。第三方元件、字型、模型與資源仍依各自授權條款使用。
