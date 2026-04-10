package com.liushoukun.infographic.lang

import com.intellij.lang.ASTNode
import com.intellij.lang.PsiBuilder
import com.intellij.lang.PsiParser
import com.intellij.psi.tree.IElementType

/**
 * 扁平语法树：高亮与注入仅需词法；此处将全文收束为单 FILE 根节点。
 */
class InfographicParser : PsiParser {

  override fun parse(root: IElementType, builder: PsiBuilder): ASTNode {
    val marker = builder.mark()
    while (!builder.eof()) {
      builder.advanceLexer()
    }
    marker.done(root)
    return builder.treeBuilt
  }
}
