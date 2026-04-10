package com.liushoukun.infographic.preview

import org.intellij.plugins.markdown.extensions.MarkdownBrowserPreviewExtension
import org.intellij.plugins.markdown.ui.preview.MarkdownHtmlPanel
import org.intellij.plugins.markdown.ui.preview.ResourceProvider

class InfographicBrowserPreviewExtensionProvider : MarkdownBrowserPreviewExtension.Provider {
  override fun createBrowserExtension(panel: MarkdownHtmlPanel): MarkdownBrowserPreviewExtension {
    return InfographicBrowserPreviewExtension()
  }
}

private class InfographicBrowserPreviewExtension : MarkdownBrowserPreviewExtension {
  override val scripts: List<String> = listOf(PREVIEW_SCRIPT_PATH)
  override val styles: List<String> = listOf(PREVIEW_STYLE_PATH)

  override val resourceProvider: ResourceProvider = object : ResourceProvider {
    override fun canProvide(resourceName: String): Boolean {
      return resourceName == PREVIEW_SCRIPT_PATH || resourceName == PREVIEW_STYLE_PATH
    }

    override fun loadResource(resourceName: String): ResourceProvider.Resource? {
      return when (resourceName) {
        PREVIEW_SCRIPT_PATH ->
          ResourceProvider.loadInternalResource(
            InfographicBrowserPreviewExtension::class,
            "/web/preview.js",
            "application/javascript; charset=utf-8"
          )
        PREVIEW_STYLE_PATH ->
          ResourceProvider.loadInternalResource(
            InfographicBrowserPreviewExtension::class,
            "/web/preview.css",
            "text/css; charset=utf-8"
          )
        else -> null
      }
    }
  }

  override fun dispose() = Unit

  companion object {
    private const val PREVIEW_SCRIPT_PATH = "antv-infographic/preview.js"
    private const val PREVIEW_STYLE_PATH = "antv-infographic/preview.css"
  }
}
