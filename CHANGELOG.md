# 变更日志

## 0.7.0

- 为 `.infographic` 文件在资源管理器中注册语言图标（`logo.svg`，与 Mermaid Chart 对 `.mmd` 的处理方式一致）
- 打开工作区内的 `.infographic` 文件时自动在侧栏打开 Infographic 可视化编辑 Webview；从 Markdown 打开的临时 `untitled` 缓冲不受影响
- 新增扩展激活事件 `onLanguage:infographic`，确保仅打开独立信息图文件时扩展也会加载

## 0.4.0

- 修复编辑器侧边栏单独渲染时 `theme hand-drawn` 字体不一致问题
- 优化侧边栏 Webview 渲染初始化与 CSP 字体/样式加载策略，提升主题字体加载稳定性

## 0.1.0

- 首次发布：Markdown 内 `infographic` 围栏代码块语法高亮（TextMate 注入 + `source.infographic`）
- 内置 Markdown 预览中渲染 AntV Infographic（`markdown.markdownItPlugins` + `markdown.previewScripts`）
- 可选独立语言 id：`infographic`，扩展名 `.infographic`
- 示例见 `examples/sample.md`
