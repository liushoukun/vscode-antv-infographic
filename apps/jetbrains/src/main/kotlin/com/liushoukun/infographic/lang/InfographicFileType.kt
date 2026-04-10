package com.liushoukun.infographic.lang

import com.intellij.icons.AllIcons
import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.openapi.vfs.VirtualFile

class InfographicFileType private constructor() : LanguageFileType(InfographicLanguage) {

  override fun getName(): String = "AntV Infographic"

  override fun getDescription(): String = "AntV Infographic DSL"

  override fun getDefaultExtension(): String = "infographic"

  override fun getIcon() = AllIcons.FileTypes.Json

  companion object {
    @JvmField
    val INSTANCE = InfographicFileType()

    @JvmStatic
    fun isInfographic(file: VirtualFile): Boolean =
      file.extension?.equals("infographic", ignoreCase = true) == true
  }
}
