package com.liushoukun.infographic.editor

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.fileEditor.impl.text.TextEditorProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.liushoukun.infographic.lang.InfographicFileType

/**
 * .infographic 文件：源码编辑器 + 与 VS Code 一致的预览（JCEF + preview.js）。
 */
class InfographicEditorProvider : FileEditorProvider, DumbAware {

  override fun accept(project: Project, file: VirtualFile): Boolean =
    InfographicFileType.isInfographic(file)

  override fun createEditor(project: Project, file: VirtualFile): FileEditor {
    val textEditor = TextEditorProvider.getInstance().createEditor(project, file) as TextEditor
    val preview = InfographicPreviewEditor(file)
    return TextEditorWithPreview(textEditor, preview, InfographicPreviewEditor.EDITOR_TAB_NAME)
  }

  override fun getEditorTypeId(): String = "antv-infographic-editor"

  override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR
}
