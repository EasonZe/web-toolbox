# 贡献指南

感谢你参与多功能工具箱。提交代码前，请先搜索现有 Issue 和 Pull Request，避免重复工作。

## 开发流程

1. Fork 仓库并从 `main` 创建短生命周期分支，例如 `feat/image-tool` 或 `fix/mobile-layout`。
2. 使用项目要求的 Node.js 版本并安装锁定依赖：

   ```bash
   npm ci
   ```

3. 完成改动后运行完整检查：

   ```bash
   npm run check
   ```

4. 提交 Pull Request，并写清问题、实现方案、验证方式及界面改动截图。

## 代码要求

- 使用 TypeScript，保持严格类型检查通过。
- 优先浏览器本地处理用户文件，不要无必要地上传媒体或文本。
- 新工具需支持浅色/深色主题、键盘操作和手机端布局。
- 新增第三方依赖前说明必要性、体积与许可证，并更新 `THIRD_PARTY_NOTICES.md`。
- 修复缺陷或新增行为时同步添加回归测试。
- 不得提交 `.env`、API Token、用户文件、构建目录或本地 QA 产物。

## 提交与 Pull Request

提交信息使用干净、简洁的简体中文，例如：

```text
增加配色导出
修复切换布局后收藏丢失
完善 Cloudflare 绑定说明
```

一个 Pull Request 应聚焦一个主题。维护者可能要求拆分与本次目标无关的改动。

## 安全问题

不要创建公开 Issue。请按照 `SECURITY.md` 中的方式私下报告。
