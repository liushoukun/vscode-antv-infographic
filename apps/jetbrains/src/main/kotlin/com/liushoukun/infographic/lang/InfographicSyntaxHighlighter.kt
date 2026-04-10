package com.liushoukun.infographic.lang

import com.intellij.lexer.Lexer
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.HighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase
import com.intellij.psi.tree.IElementType

class InfographicSyntaxHighlighter : SyntaxHighlighterBase() {

  override fun getHighlightingLexer(): Lexer = InfographicLexer()

  override fun getTokenHighlights(tokenType: IElementType?): Array<TextAttributesKey> {
    val keys = ATTRIBUTES[tokenType] ?: return TextAttributesKey.EMPTY_ARRAY
    var result = TextAttributesKey.EMPTY_ARRAY
    for (key in keys) {
      result = pack(result, key)
    }
    return result
  }

  companion object {
    private val ATTRIBUTES = mapOf(
      InfographicTokenTypes.LINE_COMMENT to arrayOf(DefaultLanguageHighlighterColors.LINE_COMMENT),
      InfographicTokenTypes.STRING to arrayOf(DefaultLanguageHighlighterColors.STRING),
      InfographicTokenTypes.KEYWORD to arrayOf(DefaultLanguageHighlighterColors.KEYWORD),
      InfographicTokenTypes.PROPERTY to arrayOf(DefaultLanguageHighlighterColors.INSTANCE_FIELD),
      InfographicTokenTypes.TYPE_REF to arrayOf(DefaultLanguageHighlighterColors.CLASS_NAME),
      InfographicTokenTypes.LIST_MARK to arrayOf(DefaultLanguageHighlighterColors.BRACES),
      InfographicTokenTypes.IDENTIFIER to arrayOf(DefaultLanguageHighlighterColors.IDENTIFIER),
      InfographicTokenTypes.VALUE to arrayOf(DefaultLanguageHighlighterColors.STRING),
      InfographicTokenTypes.BAD_CHARACTER to arrayOf(HighlighterColors.BAD_CHARACTER),
    )
  }
}
