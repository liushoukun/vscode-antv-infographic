# AntV Infographic Markdown Preview Plugins


[![AntV Infographic](https://img.shields.io/badge/AntV-Infographic-1677FF.svg)](https://github.com/antvis/infographic)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/liushoukun.vscode-antv-infographic?label=VS%20Code&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=liushoukun.vscode-antv-infographic)
[![Open VSX](https://img.shields.io/open-vsx/v/liushoukun/vscode-antv-infographic?label=Open%20VSX&logo=eclipse-theia&logoColor=white)](https://open-vsx.org/extension/liushoukun/vscode-antv-infographic)
[![JetBrains Plugin](https://img.shields.io/jetbrains/plugin/v/31195?label=JetBrains&logo=jetbrains)](https://plugins.jetbrains.com/plugin/31195-antv-infographic-markdown-preview)

在 **VS Code / Cursor** 与 **JetBrains 系列 IDE** 中，为 Markdown 与独立文件提供 **AntV Infographic** 的实时预览与编辑能力。

## 安装

在扩展/插件市场中搜索 **AntV Infographic Markdown Preview**，或点击下方标签进入对应市场安装：

[![在 VS Code 中安装](https://img.shields.io/badge/安装-VS%20Code%20Marketplace-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=liushoukun.vscode-antv-infographic)
[![在 Open VSX 安装](https://img.shields.io/badge/安装-Open%20VSX-4B32C3?style=for-the-badge&logo=eclipse-theia&logoColor=white)](https://open-vsx.org/extension/liushoukun/vscode-antv-infographic)
[![在 JetBrains 安装](https://img.shields.io/badge/安装-JetBrains%20Marketplace-000000?style=for-the-badge&logo=jetbrains&logoColor=white)](https://plugins.jetbrains.com/plugin/31195-antv-infographic-markdown-preview)

## 功能

- **Markdown 内嵌预览**：在 ` ```infographic ` 代码块中编写 Infographic DSL，在 Markdown 预览里直接渲染图表。
- **`.infographic` 独立文件**：将 DSL 存为 `.infographic` 文件，带专属图标；打开文件时可使用侧栏 **Infographic 编辑** Webview 做可视化编辑、预览与导出图片。
- **多 IDE 支持**：同一套预览与编辑体验可在常用编辑器中使用。

## Demo

![Demo](./apps/vscode/media/demo/demo-1.png)

## 用法

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

打开 Markdown 预览即可查看渲染结果。示例见 `examples/sample.md`。

### 独立 `.infographic` 文件

将 DSL 保存为 `.infographic` 文件（例如 `examples/sample.infographic`）。在资源管理器中会有 AntV 图标；在编辑器中打开后，扩展会在侧栏打开 **Infographic 编辑** Webview，便于可视化编辑、预览与导出。若只需文本编辑，可关闭侧栏面板。

## License

[MIT](LICENSE)
