package com.liushoukun.infographic.editor

import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBLabel
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.openapi.util.io.FileUtil
import com.intellij.util.Alarm
import java.awt.BorderLayout
import java.beans.PropertyChangeListener
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * 独立 .infographic 文件的 JCEF 预览（HTML 包装与 Markdown 预览脚本一致）。
 */
class InfographicPreviewEditor(
  private val file: VirtualFile,
) : UserDataHolderBase(), FileEditor {

  private val panel = JPanel(BorderLayout())
  private val alarm = Alarm(Alarm.ThreadToUse.SWING_THREAD, this)
  private var previewDir: Path? = null
  private val browser: JBCefBrowser? = if (JBCefApp.isSupported()) JBCefBrowser() else null
  private val log = logger<InfographicPreviewEditor>()

  init {
    if (browser != null) {
      panel.add(browser.component, BorderLayout.CENTER)
      Disposer.register(this, browser)
      ensureAssetsAndLoad()
      FileDocumentManager.getInstance().getDocument(file)?.addDocumentListener(
        object : DocumentListener {
          override fun documentChanged(event: DocumentEvent) {
            scheduleReload()
          }
        },
        this
      )
    } else {
      panel.add(
        JBLabel("当前运行环境不支持 JCEF，无法显示 Infographic 预览。"),
        BorderLayout.CENTER
      )
    }
  }

  private fun ensureAssetsAndLoad() {
    try {
      if (previewDir == null) {
        val dir = Files.createTempDirectory("antv-infographic-preview-")
        copyResource("/web/preview.js", dir.resolve("preview.js"))
        copyResource("/web/preview.css", dir.resolve("preview.css"))
        previewDir = dir
      }
      writeHtmlAndLoad()
    } catch (e: Exception) {
      log.warn("Infographic preview load failed", e)
    }
  }

  private fun copyResource(resourcePath: String, target: Path) {
    javaClass.getResourceAsStream(resourcePath)?.use { input ->
      Files.copy(input, target, StandardCopyOption.REPLACE_EXISTING)
    } ?: log.warn("Missing resource $resourcePath")
  }

  private fun scheduleReload() {
    alarm.cancelAllRequests()
    alarm.addRequest({ writeHtmlAndLoad() }, 150)
  }

  private fun writeHtmlAndLoad() {
    val b = browser ?: return
    val dir = previewDir ?: return
    val doc = FileDocumentManager.getInstance().getDocument(file) ?: return
    val text = doc.text
    val html = buildHtml(escapeHtml(text))
    Files.writeString(dir.resolve("index.html"), html)
    b.loadURL(dir.resolve("index.html").toUri().toString())
  }

  private fun buildHtml(escapedBody: String): String = """
    |<!DOCTYPE html>
    |<html>
    |<head>
    |<meta charset="UTF-8"/>
    |<link rel="stylesheet" href="preview.css"/>
    |</head>
    |<body>
    |<div class="vscode-infographic-host" data-vscode-infographic="1">
    |<pre><code class="language-infographic">$escapedBody</code></pre>
    |</div>
    |<script src="preview.js"></script>
    |</body>
    |</html>
    """.trimMargin()

  private fun escapeHtml(s: String): String = buildString(s.length + 16) {
    for (ch in s) {
      when (ch) {
        '<' -> append("&lt;")
        '>' -> append("&gt;")
        '&' -> append("&amp;")
        '"' -> append("&quot;")
        else -> append(ch)
      }
    }
  }

  override fun dispose() {
    alarm.dispose()
    previewDir?.let { dir ->
      try {
        FileUtil.delete(dir.toFile())
      } catch (_: Exception) {
      }
    }
    previewDir = null
  }

  override fun getComponent(): JComponent = panel

  override fun getPreferredFocusedComponent(): JComponent? = browser?.component

  override fun getName(): String = "Infographic Preview"

  override fun getState(level: FileEditorStateLevel): FileEditorState = FileEditorState.INSTANCE

  override fun setState(state: FileEditorState) {}

  override fun isModified(): Boolean = false

  override fun isValid(): Boolean = file.isValid

  override fun selectNotify() {
    scheduleReload()
  }

  override fun deselectNotify() {}

  override fun addPropertyChangeListener(listener: PropertyChangeListener) {}

  override fun removePropertyChangeListener(listener: PropertyChangeListener) {}

  override fun getCurrentLocation(): FileEditorLocation? = null

  companion object {
    const val EDITOR_TAB_NAME = "Preview"
  }
}
