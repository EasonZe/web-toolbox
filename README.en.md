<p align="center">
  <img src="./public/images/toolbox-logo.png" width="152" alt="Web Toolbox project logo">
</p>

<h1 align="center">Web Toolbox · 多功能工具箱</h1>

<p align="center">A clean, responsive collection of production-oriented online utilities</p>

<p align="center">
  <a href="./README.md">简体中文</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.en.md"><strong>English</strong></a>
</p>

<p align="center">
  <a href="https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/EasonZe/web-toolbox/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-2563eb.svg"></a>
  <a href="https://tool.easonzhan.xyz/"><img alt="Live site" src="https://img.shields.io/badge/Live-tool.easonzhan.xyz-0ea5e9.svg"></a>
</p>

Web Toolbox is built with React, Next.js, vinext and Cloudflare Workers. It provides more than 50 utilities for video, audio, images, documents, development and everyday tasks. Most media and text processing happens locally in the browser, with no desktop installation required.

## Features

- **Video:** link parsing, conversion, compression, reversal, GIF creation, audio extraction and watermarking.
- **Audio:** conversion, compression, reversal, speed and pitch adjustment, microphone testing and recording.
- **Images and design:** compression, cropping, stitching, watermarks, color extraction, pixel art, bead patterns, background removal, QR codes and 3D model previews.
- **Text and documents:** plain-text editing, format conversion, word counts, ASCII art, Chinese script conversion and Word/PDF tools.
- **Development and daily life:** file hashes, base conversion, function plotting, Morse code, short links, exchange rates, world clocks, date calculations, timers and device tests.
- **Experience:** search, categories, favorites, four list layouts, light/dark modes, custom theme colors, and responsive desktop, tablet and mobile layouts.

## Quick start

Requirements: Node.js `>= 22.13.0` and npm `>= 10`.

```bash
git clone https://github.com/EasonZe/web-toolbox.git
cd web-toolbox
npm ci
npm run dev
```

Run the complete quality gate before submitting changes:

```bash
npm run check
```

## Architecture

| Layer | Technology |
| --- | --- |
| UI and routing | React 19, Next.js 16, TypeScript, vinext |
| Build and deployment | Vite, Cloudflare Workers, Wrangler |
| Cloud services | Workers Assets, Images, D1, Rate Limiting |
| Quality | ESLint, Node.js Test Runner, GitHub Actions, Dependabot |

## Video parsing services

| Platform | Production Worker | Primary upstream | Repository status |
| --- | --- | --- | --- |
| Douyin | `eason-daoyin-api` | Public Douyin pages and playback URLs | External deployment; source not included |
| Bilibili | `eason-bilibili-api` | Official public Bilibili playback APIs | Source included |
| Kuaishou | `eason-kuaishou-api` | Third-party resolvers, then public Kuaishou pages as fallback | External deployment; source not included |

These endpoints are not general-purpose public APIs provided by this repository. A fully independent fork must supply compatible Douyin and Kuaishou services and replace the page endpoints. See [architecture](docs/architecture.md), [deployment](docs/deployment.md), and the [dependency and upstream audit](docs/dependency-audit.md) for details.

## Deployment

The main site targets Cloudflare Workers and requires Assets, Images, D1 and Rate Limiting bindings:

```bash
npm ci
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy --keep-vars
```

The domains and resource IDs in `wrangler.jsonc` belong to the production site. Forks must replace them with their own Cloudflare resources. See the [deployment guide](docs/deployment.md).

## Privacy, compliance and security

- User files are processed locally whenever possible; some network-backed tools still contact external services.
- Only parse video that you own or are authorized to use, and comply with platform terms and local law.
- Report security issues privately according to the [security policy](SECURITY.md).
- See [third-party notices](THIRD_PARTY_NOTICES.md) for dependency and asset licenses.

## Contributing

Created and maintained by [EasonZe](https://github.com/EasonZe). Issues and pull requests are welcome; please read the [contributing guide](CONTRIBUTING.md) and [code of conduct](CODE_OF_CONDUCT.md) first.

## License

Project code is available under the [MIT License](LICENSE). Third-party components, fonts, models and bundled assets remain subject to their own licenses.
