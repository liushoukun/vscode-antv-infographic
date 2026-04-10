# AntV Infographic Markdown Preview

## Introduction

Syntax highlighting and Markdown preview for [AntV Infographic](https://github.com/antvis/infographic) in **VS Code / Cursor**, with support for standalone `.infographic` files and a sidebar visual editor.

## Features

1. **Embedded Markdown**: Recognizes ` ```infographic ` fenced code blocks and renders SVG in the Markdown preview via `@antv/infographic`.
2. **Syntax highlighting**: Consistent coloring for ` ```infographic ` fences in Markdown and for `.infographic` files (TextMate injection).
3. **Standalone `.infographic` files**: Custom explorer icon; opening such a file enables the **Infographic Editor** Webview in the sidebar for visual editing, preview, and image export.

---

## 简介

在 **VS Code / Cursor** 的 Markdown 中为 [AntV Infographic](https://github.com/antvis/infographic) 提供语法高亮与预览渲染，并支持独立的 `.infographic` 源文件与侧栏可视化编辑。

## 功能

1. **Markdown 内嵌**：识别 ` ```infographic ` 围栏代码块，在 Markdown 预览中调用 `@antv/infographic` 渲染 SVG。
2. **语法高亮**：为 Markdown 中的 ` ```infographic ` 围栏与 `.infographic` 文件提供一致着色（TextMate 注入）。
3. **独立 `.infographic` 文件**：资源管理器专用图标；打开该类型文件时，侧栏可打开 **Infographic 编辑** Webview，便于可视化编辑、预览与导出图片等。

## Preview

![Demo](./media/demo/demo-1.png)

## Usage

Add a fenced block like this in Markdown:

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

Save and open **Markdown Preview** to see the result.

### Standalone `.infographic` files

Save your DSL as a file with the `.infographic` extension. It shows an AntV icon in the explorer; when opened in the editor, the extension opens the **Infographic Editor** Webview in the sidebar automatically. Close the sidebar panel if you only need plain text editing.

## License

[MIT](./LICENSE)
