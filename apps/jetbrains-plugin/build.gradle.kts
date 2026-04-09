plugins {
  id("java")
  id("org.jetbrains.kotlin.jvm") version "1.9.25"
  id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.liushoukun"
version = "0.1.0"

repositories {
  mavenCentral()
}

intellij {
  type.set(providers.gradleProperty("platformType"))
  version.set(providers.gradleProperty("platformVersion"))
  plugins.set(listOf("org.intellij.plugins.markdown"))
}

tasks {
  patchPluginXml {
    sinceBuild.set("243")
    untilBuild.set("")
  }

  withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    kotlinOptions.jvmTarget = "17"
  }

  runIde {
    jvmArgs("-Xmx2048m")
  }
}
