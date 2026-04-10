# AntV Infographic — JetBrains 插件

在 JetBrains IDE 的 **Markdown 预览** 中渲染 `infographic` 围栏代码块（依赖官方 Markdown 插件）。

插件在 JetBrains Marketplace / 插件页中的**名称、说明、图标**与仓库内 **VS Code 扩展**（`apps/vscode/package.json` 的 `displayName`、`description`、`apps/vscode/media/images/logo.svg`）及仓库根目录 `README.md` / `DESIGN.md` 保持一致口径；图标文件复制为 `src/main/resources/META-INF/pluginIcon.svg`、`pluginLogo.svg`、`pluginIcon_dark.svg`（与上游 SVG 同步更新时请一并替换）。

**语言与文件**

- **语法高亮**：Markdown 中 ` ```infographic ` 围栏内注入 `AntVInfographic` 语言；独立 `*.infographic` 文件亦使用该语言（词法规则对齐 `apps/vscode/syntaxes/infographic.tmLanguage.json`）。
- **独立文件预览**：打开 `*.infographic` 时为「文本 + Preview」分栏（`TextEditorWithPreview`），预览页加载与 Markdown 相同的 `preview.js` / `preview.css`（需 JCEF）。示例：`examples/sample.infographic`。

## 环境要求

| 依赖 | 说明 |
|------|------|
| **JDK 17** | Kotlin 编译目标为 17（见 `build.gradle.kts`） |
| **Node.js + pnpm** | 仓库根目录安装依赖；Gradle 会调用 `pnpm` 构建共享包 `packages/preview-web`（esbuild + `@antv/infographic`） |
| **Gradle** | 使用本目录已提交的 **Gradle Wrapper**（**8.10.2**）。请勿用本机 **Gradle 9.x** 直接执行 `gradle buildPlugin`，会与 `org.jetbrains.intellij` 1.17.4 不兼容 |

默认调试/打包使用的 IDE 基线见 `gradle.properties`：

- `platformType=IC`：IntelliJ IDEA **Community**
- `platformVersion=2024.1.7`：**Gradle IntelliJ Plugin 1.17.x 不支持以 2024.2（242）及以上 SDK 构建**，故锁定 2024.1.x；`patchPluginXml` 的 `sinceBuild` 为 **241**。若必须在 **243+** 上开发，请迁移到 [IntelliJ Platform Gradle Plugin 2.x](https://plugins.jetbrains.com/docs/intellij/tools-intellij-platform-gradle-plugin.html)。

## 整体流程

```mermaid
flowchart LR
  A[仓库根: pnpm install] --> B[pnpm --filter @antv-infographic/preview-web build]
  B --> C[packages/preview-web/dist/preview.js]
  C --> D[Gradle processResources 同步到 resources/web]
  D --> E[buildPlugin / runIde]
  E --> F[ZIP 或沙箱 IDE]
```

## 1. 安装依赖与共享预览脚本

1. 在**仓库根目录**执行 **`pnpm install`**（仅需一次）。
2. 构建 JetBrains 插件时，**`./gradlew buildPlugin`**（或 `processResources`）会自动执行 **`pnpm run --filter @antv-infographic/preview-web build`**，并将产物复制到 **`src/main/resources/web/preview.js`**（该文件已加入 `.gitignore`，勿手改）。

开发时若只改预览脚本：在根目录并行运行 **`pnpm --filter @antv-infographic/preview-web run watch`** 与 **`./gradlew runIde`**（保存后重新执行一次 `processResources` 或完整 `buildPlugin` 以刷新资源，视你的工作流而定）。

## 2. 打包插件（生成 ZIP）

在 **`apps/jetbrains`** 目录下执行 Gradle 任务 **`buildPlugin`**。

**推荐：始终使用 Wrapper**（锁定 Gradle **8.10.2**，避免与 IntelliJ 插件冲突）：

```bash
./gradlew buildPlugin
```

**Windows（PowerShell）**：

```powershell
.\gradlew.bat buildPlugin
```

首次运行会从 `services.gradle.org` 下载 Gradle 分发包，请保证网络可访问 HTTPS；若出现 **`PKIX path building failed`**，多为运行 Wrapper 的 JVM 过旧（如仍为 Java 8）或公司代理替换证书——请将 **`JAVA_HOME` 指向 JDK 17** 后再开终端执行，或按公司文档把代理根证书导入 JVM 信任库。

**不建议**：使用本机全局 `gradle`（尤其是 **9.x**），可能报错 `DefaultArtifactPublicationSet not present`。

**或在 IntelliJ IDEA 中**：`File` → `Open` 选择本目录 → 等待 Gradle 同步 → 在 **Gradle** 设置里选用 **Gradle Wrapper** → 右侧 **Gradle** 工具窗口 → `Tasks` → `intellij` → 双击 **`buildPlugin`**。

产物路径：

- `build/distributions/jetbrains-antv-infographic-<version>.zip`（版本号与 `build.gradle.kts` 中 `version` 一致）

## 3. 本地测试

### 方式 A：沙箱 IDE 运行（推荐开发调试）

执行 Gradle 任务 **`runIde`**（会下载对应版本的 IntelliJ 平台并带插件启动）：

```bash
./gradlew runIde
# Windows: .\gradlew.bat runIde
```

可在 IDEA 的 Gradle 面板中直接运行 `runIde`。

### 方式 B：安装 ZIP 到已安装的 IDE

1. 先完成 **2. 打包**，得到 `build/distributions/*.zip`。
2. 打开 **IntelliJ IDEA**（或其它兼容的 JetBrains IDE，需已安装 **Markdown** 插件）。
3. `Settings`（macOS 为 `Preferences`）→ `Plugins` → ⚙ → **`Install Plugin from Disk...`** → 选择上述 ZIP。
4. 重启 IDE 后，打开含 `infographic` 代码块的 Markdown，在预览中验证渲染。

## 4. 开发与调试

### 4.1 用沙箱 IDE 断点调试（Kotlin）

1. 用 **IntelliJ IDEA** 打开本目录 `apps/jetbrains`。
2. 终端在仓库根执行 `pnpm --filter @antv-infographic/preview-web run watch`（可选）；改 `packages/preview-web` 后需让 Gradle 重新 `processResources` 或 `buildPlugin` 以更新插件内 `preview.js`。
3. Gradle 面板运行 **`runIde`**，会启动带当前插件的干净 IDE。
4. 在 Kotlin 源码里下断点（例如 `InfographicBrowserPreviewExtensionProvider`），沙箱 IDE 里打开 Markdown 预览即可命中。

前端脚本在预览页内运行，需在沙箱 IDE 的 **Markdown 预览** 里打开 JCEF 开发者工具（不同版本入口略有差异，常见在预览区域右键或 `Tools` / 搜索 *Open DevTools* / *JCEF*）。

### 4.2 在 PhpStorm 等其它 IDE里验证

`gradle.properties` 里默认 `platformType=IC` 用于开发与编译基线；要**用沙箱启动 PhpStorm** 做联调，可临时改为（版本号与 `platformVersion` 对齐同一大版本）：

```properties
platformType=PS
```

然后执行 `.\gradlew.bat runIde`。其它产品代号可参考 [Gradle IntelliJ Plugin / IDE 类型](https://plugins.jetbrains.com/docs/intellij/tools-gradle-intellij-plugin.html#intellij-extension-type)。

### 4.3 「仅支持 IntelliJ IDEA、不支持 PhpStorm」的原因与修复

JetBrains 文档说明：若 `plugin.xml` **只**声明对**其它插件**的依赖、**没有**声明任何 **Platform 模块**（如 `com.intellij.modules.platform`），平台会把该插件当成旧式插件，**仅在 IntelliJ IDEA 中加载**。

本仓库已在 `plugin.xml` 中增加 `com.intellij.modules.platform`，并保留对 `org.intellij.plugins.markdown` 的依赖；**重新打包安装**后，Marketplace / 插件页应显示可在 PhpStorm、WebStorm 等基于 IntelliJ 的 IDE 中使用（仍需目标 IDE 内置或启用 **Markdown** 插件）。

### 4.4 Markdown 预览不渲染时建议排查

- 围栏语言名须为 **`infographic`**（与脚本里选择器 `code.language-infographic` 一致），例如：

  ````markdown
  ```infographic
  { "type": "..." }
  ```
  ````

- 打包或 `runIde` 时 Gradle 已执行 **`buildPreviewWeb`**；若手动跳过，请先在仓库根执行 **`pnpm --filter @antv-infographic/preview-web run build`**。
- 在预览页开发者工具中查看是否有脚本/资源加载失败、控制台报错。
- 确认使用的是 **内置 Markdown 预览**（本插件通过 `browserPreviewExtensionProvider` 注入脚本，依赖官方 Markdown 插件的预览管线）。

## 5. 相关文件

| 文件 | 作用 |
|------|------|
| `build.gradle.kts` | 插件版本、Kotlin、IntelliJ Gradle 插件配置 |
| `gradle.properties` | 平台类型与版本 |
| `src/main/resources/META-INF/plugin.xml` | 插件 ID、说明、依赖 Markdown、扩展点注册 |
| `src/main/resources/META-INF/pluginIcon*.svg`、`pluginLogo.svg` | 插件列表/详情图标（与 `apps/vscode/media/images/logo.svg` 同源） |
| `../../packages/preview-web` | 共享 Markdown 预览脚本源码与 esbuild 配置 |
| `gradle/wrapper/`、`gradlew*` | Gradle Wrapper，固定使用 8.10.2 |

更详细的技术说明见同目录下的 `jetbrains-infographic-preview-tech-plan.md`。

> **注意**：`plugin.xml` 中需同时声明 `com.intellij.modules.platform` 与 `org.intellij.plugins.markdown`，否则会出现「仅 IDEA 兼容」的提示，见上文 **4.3**。
