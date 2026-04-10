package com.liushoukun.infographic.lang

import com.intellij.lexer.LexerBase
import com.intellij.psi.tree.IElementType

/**
 * 词法分析：对齐 [docs/infographic-syntax-spec.md] 与官方语法
 * https://infographic.antv.vision/learn/infographic-syntax#
 *
 * 行模型：可选缩进 → 可选 `- ` → 键（`infographic` 或 `[\w.-]+`）→ 可选「值」（取至行尾），避免将 `/`、数字等标为 BAD_CHARACTER。
 */
class InfographicLexer : LexerBase() {

  private var buffer: CharSequence = ""
  private var bufferStart = 0
  private var bufferEnd = 0
  private var tokenStart = 0
  private var tokenEnd = 0
  private var tokenType: IElementType? = null
  /** 0 普通；1 双引号串；2 单引号串 */
  private var stringQuote = 0
  /** 刚读完键（或 `theme`），下一非空白段为行尾值 */
  private var pendingValue = false

  override fun start(buffer: CharSequence, startOffset: Int, endOffset: Int, initialState: Int) {
    this.buffer = buffer
    bufferStart = startOffset
    bufferEnd = endOffset
    tokenEnd = startOffset
    stringQuote = initialState and 0xFF
    pendingValue = (initialState and PENDING_VALUE_MASK) != 0
    advance()
  }

  override fun getState(): Int = stringQuote or if (pendingValue) PENDING_VALUE_MASK else 0

  override fun getTokenType(): IElementType? = tokenType

  override fun getTokenStart(): Int = tokenStart

  override fun getTokenEnd(): Int = tokenEnd

  override fun getBufferSequence(): CharSequence = buffer

  override fun getBufferEnd(): Int = bufferEnd

  override fun advance() {
    tokenStart = tokenEnd
    if (tokenStart >= bufferEnd) {
      tokenType = null
      return
    }

    if (pendingValue) {
      val c = buffer[tokenEnd]
      when {
        c == ' ' || c == '\t' -> {
          tokenType = InfographicTokenTypes.WHITE_SPACE
          while (tokenEnd < bufferEnd) {
            val ch = buffer[tokenEnd]
            if (ch != ' ' && ch != '\t') break
            tokenEnd++
          }
          return
        }
        c == '\r' || c == '\n' -> pendingValue = false
        else -> {
          scanValueToEol()
          pendingValue = false
          return
        }
      }
    }

    when (stringQuote) {
      1 -> {
        tokenType = scanDoubleQuotedString()
        return
      }
      2 -> {
        tokenType = scanSingleQuotedString()
        return
      }
    }

    val c = buffer[tokenEnd]
    when {
      c == '\r' || c == '\n' || c == '\t' || c == ' ' -> {
        tokenType = InfographicTokenTypes.WHITE_SPACE
        while (tokenEnd < bufferEnd) {
          val ch = buffer[tokenEnd]
          if (ch != ' ' && ch != '\t' && ch != '\r' && ch != '\n') break
          tokenEnd++
        }
      }
      c == '#' -> {
        tokenType = InfographicTokenTypes.LINE_COMMENT
        while (tokenEnd < bufferEnd && buffer[tokenEnd] != '\n') tokenEnd++
      }
      c == '"' -> {
        stringQuote = 1
        tokenEnd++
        tokenType = scanDoubleQuotedString()
      }
      c == '\'' -> {
        stringQuote = 2
        tokenEnd++
        tokenType = scanSingleQuotedString()
      }
      isLineStartBullet(tokenStart) && c == '-' -> {
        tokenType = InfographicTokenTypes.LIST_MARK
        tokenEnd++
        if (tokenEnd < bufferEnd && buffer[tokenEnd] == ' ') tokenEnd++
      }
      isLineKeyPosition(tokenStart) -> {
        if (!consumeInfographicKeywordIfAny()) {
          scanLineStartKey()
        }
      }
      else -> scanWordOrSymbol()
    }
  }

  /** 行首 `infographic` 关键字（整词），模板 slug 由后续 `scanWordOrSymbol` 处理。 */
  private fun consumeInfographicKeywordIfAny(): Boolean {
    if (!regionMatchesIgnoreCase(tokenEnd, INFOGRAPHIC_LEN, INFOGRAPHIC)) return false
    val after = tokenEnd + INFOGRAPHIC_LEN
    if (after < bufferEnd && isIdContinue(buffer[after])) return false
    tokenStart = tokenEnd
    tokenEnd = after
    tokenType = InfographicTokenTypes.KEYWORD
    return true
  }

  private fun scanLineStartKey() {
    tokenStart = tokenEnd
    val c0 = buffer[tokenStart]
    if (!c0.isLetter() && c0 != '_') {
      tokenEnd++
      tokenType = InfographicTokenTypes.BAD_CHARACTER
      return
    }
    while (tokenEnd < bufferEnd) {
      val ch = buffer[tokenEnd]
      if (isIdContinue(ch) || ch == '.' || ch == '-') tokenEnd++
      else break
    }
    val raw = buffer.subSequence(tokenStart, tokenEnd).toString()
    val wl = raw.lowercase()
    val keyType = classifyLineStartKey(raw, wl)
    tokenType = keyType
    pendingValue = shouldOpenValueAfterKey(keyType, wl)
  }

  private fun classifyLineStartKey(raw: String, wl: String): IElementType {
    if (raw.contains('.')) return InfographicTokenTypes.PROPERTY
    if (wl in BLOCK_KEYWORDS) return InfographicTokenTypes.KEYWORD
    if (wl in PROPERTY_NAMES) return InfographicTokenTypes.PROPERTY
    return InfographicTokenTypes.IDENTIFIER
  }

  private fun shouldOpenValueAfterKey(type: IElementType, wl: String): Boolean {
    if (type == InfographicTokenTypes.PROPERTY) return true
    if (type == InfographicTokenTypes.IDENTIFIER) return true
    if (type == InfographicTokenTypes.KEYWORD && wl == "theme") return true
    return false
  }

  private fun scanValueToEol() {
    tokenStart = tokenEnd
    while (tokenEnd < bufferEnd) {
      val ch = buffer[tokenEnd]
      if (ch == '\n' || ch == '\r') break
      tokenEnd++
    }
    tokenType = InfographicTokenTypes.VALUE
  }

  private fun isLineStartBullet(offset: Int): Boolean {
    var i = offset - 1
    while (i >= bufferStart) {
      val ch = buffer[i]
      if (ch == '\n') return true
      if (ch != ' ' && ch != '\t') return false
      i--
    }
    return true
  }

  /**
   * 当前 offset 是否处于「行内键」位置：从行首到 offset 仅空白，且至多一组 `- ` 列表符。
   */
  private fun isLineKeyPosition(offset: Int): Boolean {
    var lineStart = offset - 1
    while (lineStart >= bufferStart && buffer[lineStart] != '\n') lineStart--
    lineStart++
    var i = lineStart
    var seenBullet = false
    while (i < offset) {
      when (val ch = buffer[i]) {
        ' ', '\t' -> i++
        '-' -> {
          if (seenBullet) return false
          seenBullet = true
          i++
          while (i < offset && (buffer[i] == ' ' || buffer[i] == '\t')) i++
        }
        else -> return false
      }
    }
    return true
  }

  private fun scanDoubleQuotedString(): IElementType {
    while (tokenEnd < bufferEnd) {
      val ch = buffer[tokenEnd]
      if (ch == '\\' && tokenEnd + 1 < bufferEnd) {
        tokenEnd += 2
        continue
      }
      if (ch == '"') {
        tokenEnd++
        stringQuote = 0
        return InfographicTokenTypes.STRING
      }
      tokenEnd++
    }
    stringQuote = 0
    return InfographicTokenTypes.STRING
  }

  private fun scanSingleQuotedString(): IElementType {
    while (tokenEnd < bufferEnd) {
      val ch = buffer[tokenEnd]
      if (ch == '\\' && tokenEnd + 1 < bufferEnd) {
        tokenEnd += 2
        continue
      }
      if (ch == '\'') {
        tokenEnd++
        stringQuote = 0
        return InfographicTokenTypes.STRING
      }
      tokenEnd++
    }
    stringQuote = 0
    return InfographicTokenTypes.STRING
  }

  private fun isIdContinue(ch: Char): Boolean = ch.isLetterOrDigit() || ch == '_' || ch == '-'

  private fun scanWordOrSymbol() {
    val start = tokenEnd
    val c = buffer[start]
    if (!c.isLetter() && c != '_' && c != '-') {
      tokenEnd++
      tokenType = InfographicTokenTypes.BAD_CHARACTER
      return
    }
    while (tokenEnd < bufferEnd && isIdContinue(buffer[tokenEnd])) tokenEnd++
    val word = buffer.subSequence(start, tokenEnd).toString()
    val wl = word.lowercase()
    tokenType = when {
      wl.contains('-') && isAfterInfographicKeyword(start) -> InfographicTokenTypes.TYPE_REF
      else -> InfographicTokenTypes.IDENTIFIER
    }
  }

  private fun isAfterInfographicKeyword(wordStart: Int): Boolean {
    var lineStart = wordStart - 1
    while (lineStart >= bufferStart && buffer[lineStart] != '\n') lineStart--
    lineStart++
    val raw = buffer.subSequence(lineStart, wordStart).toString()
    return raw.matches(Regex("^\\s*infographic\\s+$", RegexOption.IGNORE_CASE))
  }

  private fun regionMatchesIgnoreCase(offset: Int, length: Int, s: String): Boolean {
    if (offset + length > bufferEnd) return false
    for (i in 0 until length) {
      if (!buffer[offset + i].equals(s[i], ignoreCase = true)) return false
    }
    return true
  }

  companion object {
    private const val PENDING_VALUE_MASK = 0x200
    private const val INFOGRAPHIC = "infographic"
    private const val INFOGRAPHIC_LEN = 11

    private val BLOCK_KEYWORDS = setOf("data", "theme", "template", "design")

    /**
     * 官方语法中出现的键名（块内字段 / 数据项 / 边属性 / 常用 design·theme 配置）。
     * 未知键仍按 IDENTIFIER + 行尾值处理，不标红。
     */
    private val PROPERTY_NAMES = buildSet {
      addAll(
        listOf(
          "label", "desc", "title", "value", "name", "type", "icon", "id",
          "lists", "sequences", "values", "nodes", "relations", "compares",
          "root", "children", "items", "order",
          "category", "group",
          "from", "to", "direction", "showarrow", "arrowtype",
          "structure", "item",
          "gap", "showicon", "align", "showtitle", "padding", "margin", "fontsize", "fontweight",
          "colorbg", "colorprimary", "palette", "stylize", "roughness",
          "fill", "stroke", "base", "shape", "text", "color", "fontfamily",
        ),
      )
    }
  }
}
