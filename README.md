# AntV Infographic Markdown Preview（多 IDE）

本仓库 **antv-infographic-markdown-preview-plugins** 为 monorepo，包含：

- **`packages/preview-web`**：Markdown 预览页注入的共享 `preview.js`（`@antv/infographic` 浏览器端打包）。
- **`apps/vscode`**：VS Code / Cursor 扩展（`vscode-antv-infographic`）。
- **`apps/jetbrains`**：JetBrains IDE 插件（Gradle + Kotlin）。

## 开发

- **安装依赖**（在仓库根目录）：`pnpm install`
- **构建全部**：`pnpm run build`（先构建 `preview-web`，再构建 VS Code 扩展）
- **VS Code 调试**：在根目录打开仓库，使用「Run Extension」；扩展路径为 `apps/vscode`。
- **JetBrains**：`./gradlew buildPlugin` 前需已安装 Node/pnpm，Gradle 会在 `processResources` 阶段调用根目录的 `pnpm run --filter @antv-infographic/preview-web build` 并同步 `preview.js`。

## VS Code 扩展说明

在 Markdown 中内嵌 ` ```infographic ` 围栏预览，并支持独立 `.infographic` 文件与侧栏可视化编辑等能力。

## Demo

![Demo](./apps/vscode/media/demo/demo-1.png)

## Usage

在 Markdown 中加入如下代码块：

````markdown
```infographic
infographic list-row-simple-horizontal-arrow
data
  lists
    - label Step 1
      desc Start
    - label Step 2
      desc In Progress
```
````

然后打开 Markdown 预览即可查看渲染结果。  
可直接使用示例文件：`examples/sample.md`。

### 独立 `.infographic` 文件

将 DSL 保存为扩展名为 `.infographic` 的文件（例如 `examples/sample.infographic`）。在资源管理器中会有 AntV 图标；在编辑器中打开该文件后，扩展会自动在侧栏打开 **Infographic 编辑** Webview，便于可视化编辑、预览与导出图片。若仅需文本编辑，可照常关闭侧栏面板。

## License

[MIT](LICENSE)
