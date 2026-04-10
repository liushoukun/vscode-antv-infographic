# JetBrains AntV Infographic Markdown 预览技术方案

## 1. 背景与目标

当前 VSCode 插件已具备以下能力：

- 在 Markdown 中识别 ` ```infographic ` 代码块。
- 将代码块包装为稳定容器（`.vscode-infographic-host[data-vscode-infographic="1"]`）。
- 在预览页注入脚本并调用 `@antv/infographic` 渲染。
- 通过 `MutationObserver + debounce` 实现变更后自动重渲染。

本方案目标是在 JetBrains 平台（IntelliJ IDEA / WebStorm / PyCharm 等）实现同等的 **Markdown 预览渲染能力**，首期仅覆盖预览，不包含编辑器联动和可视化编辑面板。

## 2. 范围定义

### 2.1 In Scope（首期）

- 识别 Markdown fenced code block：`infographic`。
- Markdown Preview 输出可识别容器 HTML。
- 注入 `preview.js` / `preview.css` 到 Preview 页面。
- 使用 `@antv/infographic` 完成渲染。
- 代码块变化后自动刷新。
- 失败场景显示错误信息，不阻塞其余内容渲染。

### 2.2 Out of Scope（首期不做）

- 类 VSCode CodeLens/Gutter 的编辑入口。
- 源文档与临时文档的双向同步。
- 侧边栏可视化编辑器。
- 语法高亮增强（如需要可在二期加入）。

## 3. 总体架构

```mermaid
flowchart LR
  A[Markdown 源文件] --> B[JetBrains Markdown 预览转换链路]
  B --> C[输出 infographic 容器HTML]
  C --> D[注入 preview.js / preview.css]
  D --> E[DOM 扫描 host 容器]
  E --> F[@antv/infographic.render]
  B --> G[内容变更事件]
  G --> H[MutationObserver + Debounce]
  H --> E
```

### 3.1 分层设计

- **宿主层（Kotlin / IntelliJ Platform）**
  - 对接 Markdown Preview 扩展点。
  - 注入脚本与样式资源。
  - 负责 fenced block 到目标 HTML 容器的映射。
- **渲染层（TypeScript / Browser Runtime）**
  - 复用现有 `preview.ts` 核心逻辑。
  - 处理扫描、渲染、复用、销毁、错误展示与防抖。

## 4. 关键设计

## 4.1 容器协议（与 VSCode 统一）

统一协议可降低跨平台维护成本：

- Host 选择器：`.vscode-infographic-host[data-vscode-infographic="1"]`
- 源码节点：`code.language-infographic`
- 缓存节点：`template.vscode-infographic-src`
- 画布节点：`.vscode-infographic-canvas`
- 错误节点：`pre.vscode-infographic-error`

## 4.2 渲染生命周期

1. 扫描 host 容器。
2. 提取并清洗源代码（trim）。
3. 命中跳过条件则不重复渲染（已有 canvas 且 template 内容一致）。
4. 若存在旧实例：执行 `destroy()` 并清理 WeakMap。
5. 创建 canvas，初始化 `Infographic` 实例，调用 `render(source)`。
6. 失败时显示错误信息。

## 4.3 自动刷新策略

- `MutationObserver` 监听 `document.body` 的子树变更。
- 使用 `DEBOUNCE_MS = 120` 合并短时间内多次变更。
- 每轮仅扫描 host，避免全量页面重绘。

## 4.4 错误处理与降级

- 捕获渲染异常并展示可读错误消息（保留原页面可用性）。
- 对非法输入、空代码块直接返回，不报错。
- 对实例销毁异常吞掉（防止影响后续渲染流程）。

## 5. 工程结构建议

```text
<monorepo>/packages/preview-web/
  src/preview.ts                # 与 VS Code 共用的 Markdown 预览脚本（Gradle 构建时打入本插件 resources）
apps/jetbrains/
  src/main/kotlin/
    ...                         # 插件入口与 Markdown 接入实现
  src/main/resources/
    META-INF/plugin.xml
    web/
      preview.js                # 由 Gradle syncPreviewJs 从 preview-web/dist 复制（通常不提交）
      preview.css
  build.gradle.kts
  settings.gradle.kts
```

## 6. 开发阶段与里程碑

## 6.1 阶段一：插件骨架（0.5 天）

- 初始化 IntelliJ Platform 插件工程（Gradle + Kotlin）。
- 声明与 Markdown 插件的依赖关系。
- 完成最小可加载插件。

**里程碑 M1：** 插件可在 JetBrains IDE 中安装并启用。

## 6.2 阶段二：Preview 接入（1~1.5 天）

- 完成 `infographic` fenced block 的识别和容器化输出。
- 将 `preview.js` / `preview.css` 注入 Preview 页面。

**里程碑 M2：** 预览页可见目标容器，脚本可执行。

## 6.3 阶段三：渲染内核迁移（1 天）

- 迁移 `preview.ts` 核心流程：
  - `getSource`
  - `shouldSkip`
  - `renderHost`
  - `scan/scheduleScan`
  - `MutationObserver`
- 引入 `@antv/infographic` 并完成打包。

**里程碑 M3：** ` ```infographic ` 代码块可正确渲染并自动刷新。

## 6.4 阶段四：稳定性与性能（0.5~1 天）

- 大文档压测（20/50/100 代码块）。
- 观察重复渲染与内存占用，确保实例销毁生效。
- 优化异常信息和边界场景。

**里程碑 M4：** 达到可发布质量。

## 7. 验收标准（DoD）

- 能识别并渲染 ` ```infographic ` 代码块。
- 修改代码后预览在 1 秒内更新（目标 < 300ms）。
- 错误 DSL 能显示明确报错，不影响其他内容。
- 多次打开/关闭预览无明显内存泄漏或重复渲染问题。

## 8. 风险与应对

- **Markdown 扩展点差异风险**
  - 先做最小 PoC：静态容器 + 静态脚本注入，验证接入链路。
- **Preview 资源加载与 CSP 风险**
  - 资源全部本地打包，避免远程依赖。
- **性能风险（大量代码块）**
  - 使用跳过策略 + 防抖 + 实例销毁。
- **跨平台差异风险（IDE 版本）**
  - 选择明确的最低平台版本并矩阵验证。

## 9. 测试计划

- **功能测试**
  - 基本渲染、编辑后刷新、错误提示、空块处理。
- **兼容性测试**
  - IntelliJ IDEA / WebStorm（至少两个版本）。
- **性能测试**
  - 多代码块页面首次渲染与多次更新耗时。
- **稳定性测试**
  - 反复打开关闭 Preview，监控渲染实例数量与内存变化。

## 10. 二期演进建议

- 编辑入口（工具栏/意图动作）打开专用编辑器。
- Markdown 源与编辑态文档同步。
- `infographic` 语法高亮增强。
- 渲染参数配置化（高度、主题、缩放等）。

