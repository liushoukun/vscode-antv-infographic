plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.liushoukun"
version = "0.2.0"

/** 仓库根目录（本工程位于 apps/jetbrains） */
val monorepoRoot: java.io.File = rootDir.parentFile.parentFile

repositories {
    mavenCentral()
}

intellij {
    type.set(providers.gradleProperty("platformType"))
    version.set(providers.gradleProperty("platformVersion"))
    plugins.set(listOf("org.intellij.plugins.markdown"))
}

val previewWebDist = monorepoRoot.resolve("packages/preview-web/dist/preview.js")

val buildPreviewWeb =
    tasks.register<Exec>("buildPreviewWeb") {
        group = "build"
        description = "构建共享 Markdown 预览脚本（pnpm：@antv-infographic/preview-web）"
        workingDir = monorepoRoot
        val isWindows = System.getProperty("os.name").lowercase().contains("windows")
        if (isWindows) {
            commandLine("cmd", "/c", "pnpm run --filter @antv-infographic/preview-web build")
        } else {
            commandLine("pnpm", "run", "--filter", "@antv-infographic/preview-web", "build")
        }
    }

val syncPreviewJs =
    tasks.register<Copy>("syncPreviewJs") {
        group = "build"
        description = "将 preview-web 产物复制到 src/main/resources/web/"
        dependsOn(buildPreviewWeb)
        from(previewWebDist)
        into(layout.projectDirectory.dir("src/main/resources/web"))
        duplicatesStrategy = DuplicatesStrategy.INCLUDE
    }

tasks.named("processResources") {
    dependsOn(syncPreviewJs)
}

tasks {
    patchPluginXml {
        sinceBuild.set("241")
        untilBuild.set("")
    }

    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }

    runIde {
        jvmArgs("-Xmx2048m")
    }
}
