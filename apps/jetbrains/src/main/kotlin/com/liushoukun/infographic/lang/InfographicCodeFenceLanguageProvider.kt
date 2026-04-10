package com.liushoukun.infographic.lang

import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.lang.Language
import org.intellij.plugins.markdown.injection.CodeFenceLanguageProvider

/**
 * 在 Markdown 围栏中识别 ```infographic，与 VS Code 语法注入一致。
 */
class InfographicCodeFenceLanguageProvider : CodeFenceLanguageProvider {

  override fun getLanguageByInfoString(infoString: String): Language? {
    val langId = infoString.trim().split(Regex("\\s+")).firstOrNull() ?: return null
    return if (langId.equals("infographic", ignoreCase = true)) InfographicLanguage else null
  }

  override fun getCompletionVariantsForInfoString(parameters: CompletionParameters): List<LookupElement> =
    emptyList()
}
