package com.liushoukun.infographic.lang

import com.intellij.extapi.psi.PsiFileBase
import com.intellij.openapi.fileTypes.FileType
import com.intellij.psi.FileViewProvider
import com.intellij.psi.PsiElementVisitor

class InfographicFile(viewProvider: FileViewProvider) : PsiFileBase(viewProvider, InfographicLanguage) {

  override fun getFileType(): FileType = InfographicFileType.INSTANCE

  override fun accept(visitor: PsiElementVisitor) {
    visitor.visitFile(this)
  }
}
