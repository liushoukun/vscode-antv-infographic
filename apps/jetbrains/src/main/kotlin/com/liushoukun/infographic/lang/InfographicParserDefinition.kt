package com.liushoukun.infographic.lang

import com.intellij.lang.ASTNode
import com.intellij.lang.ParserDefinition
import com.intellij.lang.PsiParser
import com.intellij.lexer.Lexer
import com.intellij.openapi.project.Project
import com.intellij.psi.FileViewProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.impl.source.tree.LeafPsiElement
import com.intellij.psi.impl.source.tree.PsiWhiteSpaceImpl
import com.intellij.psi.tree.IFileElementType
import com.intellij.psi.tree.TokenSet

class InfographicParserDefinition : ParserDefinition {

  override fun createLexer(project: Project?): Lexer = InfographicLexer()

  override fun createParser(project: Project?): PsiParser = InfographicParser()

  override fun getFileNodeType(): IFileElementType = FILE

  override fun getCommentTokens(): TokenSet = TokenSet.create(InfographicTokenTypes.LINE_COMMENT)

  override fun getStringLiteralElements(): TokenSet = TokenSet.create(InfographicTokenTypes.STRING)

  override fun createElement(node: ASTNode): PsiElement {
    val type = node.elementType
    return if (type == InfographicTokenTypes.WHITE_SPACE) {
      PsiWhiteSpaceImpl(node.text)
    } else {
      LeafPsiElement(type, node.text)
    }
  }

  override fun createFile(viewProvider: FileViewProvider): PsiFile = InfographicFile(viewProvider)

  companion object {
    @JvmField
    val FILE: IFileElementType = IFileElementType("ANTV_INFOGRAPHIC_FILE", InfographicLanguage)
  }
}
