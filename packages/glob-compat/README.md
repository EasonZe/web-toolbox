# 构建工具 Glob 兼容层

使用成熟的 [tinyglobby](https://github.com/SuperchupuDev/tinyglobby)（MIT）替代构建依赖中的 `fast-glob → micromatch → braces` 链。真实的路径匹配由 tinyglobby 执行，不复制或修改上游匹配器，不忽略 npm 安全告警。

根清单通过本地 `file:` 依赖和 npm override 接入，`npm ci` 会按锁文件安装。此包不单独发布；自身代码遵循仓库根目录的 MIT License。

## 范围

- 兼容当前 `@next/eslint-plugin-next` 的 `globSync(pattern, { onlyDirectories: true })`。
- 兼容当前 `vite-plugin-dynamic-import` 的 `sync(patterns, { cwd })`。
- 支持异步调用、`glob` / `sync` / `globSync` 和基本路径辅助方法。
- 支持源码中列出的路径匹配选项；禁用 tinyglobby 默认的目录内容展开，以保留 fast-glob 的目录匹配语义。
- 不提供完整 fast-glob 替代承诺。不支持任务生成、流、对象与文件 stat 模式；未知选项会明确抛错，避免静默改变构建结果。
- 入口对匹配及忽略表达式进行长度与嵌套限制，避免过深模式耗尽解析栈。

升级 ESLint 或 Vite 插件后，需重新核对其 glob 调用，并运行兼容测试、Lint 和完整构建。测试覆盖多扩展名、目录、否定模式、隐藏文件、同步/异步结果和过深嵌套防护。
