import type MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import * as vscode from 'vscode';
import { InfographicCodeLensProvider } from './codeLensProvider';
import { InfographicGutterDecorationProvider } from './gutterDecorationProvider';
import { InfographicEditorPanel } from './infographicEditorPanel';
import { SaveHandler } from './saveHandler';
import { SyncService } from './syncService';
import { TempFileCache } from './tempFileCache';

const ICONIFY_SVG_ENDPOINT = 'https://api.iconify.design';
const ICON_ID_RE = /^[a-z0-9-]+\/[a-z0-9-]+$/i;
const iconDataUriCache = new Map<string, string>();
const iconFetchPending = new Set<string>();
let previewRefreshTimer: ReturnType<typeof setTimeout> | undefined;

function toSvgDataUri(svgText: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgText)}`;
}

function schedulePreviewRefresh() {
  if (previewRefreshTimer) {
    clearTimeout(previewRefreshTimer);
  }
  previewRefreshTimer = setTimeout(() => {
    previewRefreshTimer = undefined;
    void vscode.commands.executeCommand('markdown.preview.refresh');
  }, 120);
}

async function fetchAndCacheRemoteIcon(iconId: string): Promise<void> {
  if (!ICON_ID_RE.test(iconId)) {
    return;
  }
  if (iconDataUriCache.has(iconId) || iconFetchPending.has(iconId)) {
    return;
  }
  iconFetchPending.add(iconId);
  try {
    const resp = await fetch(`${ICONIFY_SVG_ENDPOINT}/${iconId}.svg`);
    if (!resp.ok) {
      return;
    }
    const svgText = await resp.text();
    if (!svgText.trim().startsWith('<svg')) {
      return;
    }
    iconDataUriCache.set(iconId, toSvgDataUri(svgText));
    schedulePreviewRefresh();
  } catch {
    // 远程失败时保持原始 icon id，不中断渲染
  } finally {
    iconFetchPending.delete(iconId);
  }
}

function rewriteDslIconsForPreview(dsl: string): string {
  return dsl.replace(/^(\s*icon\s+)([a-z0-9-]+\/[a-z0-9-]+)(\s*)$/gim, (_m, p1, iconId, p3) => {
    const cached = iconDataUriCache.get(iconId);
    if (cached) {
      return `${p1}${cached}${p3}`;
    }
    void fetchAndCacheRemoteIcon(iconId);
    return `${p1}${iconId}${p3}`;
  });
}

/**
 * 为 infographic 围栏块包一层稳定容器，便于预览脚本定位（见 markdown 扩展指南）。
 */
function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
  const defaultFence = md.renderer.rules.fence;
  if (!defaultFence) {
    return md;
  }

  md.renderer.rules.fence = (
    tokens: Token[],
    idx: number,
    options: MarkdownIt.Options,
    env: unknown,
    self: MarkdownIt.Renderer
  ): string => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const lang = info.split(/\s+/)[0] ?? '';

    if (lang === 'infographic') {
      const rewritten = rewriteDslIconsForPreview(token.content);
      const escaped = md.utils.escapeHtml(rewritten);
      return `<div class="vscode-infographic-host" data-vscode-infographic="1"><pre><code class="language-infographic">${escaped}</code></pre></div>\n`;
    }

    return defaultFence(tokens, idx, options, env, self);
  };

  return md;
}

function findInfographicBlockAtCursor(
  editor: vscode.TextEditor
): { uri: vscode.Uri; range: vscode.Range } | undefined {
  const doc = editor.document;
  if (doc.languageId !== 'markdown') {
    return undefined;
  }
  const posLine = editor.selection.active.line;
  const text = doc.getText();
  const lines = text.split('\n');
  const re = /^```infographic\s*$/i;
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i].trim())) {
      continue;
    }
    let end = i + 1;
    while (end < lines.length && lines[end].trim() !== '```') {
      end++;
    }
    if (end >= lines.length) {
      continue;
    }
    if (posLine > i && posLine < end) {
      return {
        uri: doc.uri,
        range: new vscode.Range(new vscode.Position(i + 1, 0), new vscode.Position(end, 0)),
      };
    }
  }
  return undefined;
}

/** 工作区内真实 `.infographic` 文件（非 Markdown 同步用的 untitled 缓冲）。 */
function isWorkspaceInfographicFile(document: vscode.TextDocument): boolean {
  if (document.languageId !== 'infographic') {
    return false;
  }
  if (document.uri.scheme !== 'file') {
    return false;
  }
  return document.fileName.toLowerCase().endsWith('.infographic');
}

function openInfographicEditorForStandaloneFile(
  document: vscode.TextDocument,
  context: vscode.ExtensionContext
): void {
  if (!isWorkspaceInfographicFile(document)) {
    return;
  }
  InfographicEditorPanel.createOrShow(document, context);
}

export function activate(context: vscode.ExtensionContext) {
  const codeLensProvider = new InfographicCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'markdown' }, codeLensProvider)
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === 'markdown') {
        codeLensProvider.refresh();
      }
    })
  );

  const gutter = new InfographicGutterDecorationProvider(context);
  context.subscriptions.push(gutter);

  context.subscriptions.push(new SaveHandler(context).register());

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        openInfographicEditorForStandaloneFile(editor.document, context);
      }
    })
  );

  const initialEditor = vscode.window.activeTextEditor;
  if (initialEditor) {
    openInfographicEditorForStandaloneFile(initialEditor.document, context);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'antvInfographic.editBlock',
      async (documentUri?: vscode.Uri, range?: vscode.Range) => {
        try {
          let uri = documentUri;
          let contentRange = range;
          if (!uri || !contentRange) {
            const editor = vscode.window.activeTextEditor;
            const hit = editor ? findInfographicBlockAtCursor(editor) : undefined;
            if (!hit) {
              void vscode.window.showWarningMessage(
                '请将光标放在 Markdown 中的 ```infographic 代码块内，或通过 CodeLens 打开编辑。'
              );
              return;
            }
            uri = hit.uri;
            contentRange = hit.range;
          }
          const document = await vscode.workspace.openTextDocument(uri);
          const content = document.getText(contentRange);
          if (!content.trim()) {
            void vscode.window.showWarningMessage('Infographic 代码块内容为空。');
            return;
          }
          const untitled = await vscode.workspace.openTextDocument({
            content,
            language: 'infographic',
          });
          TempFileCache.add(context, untitled.uri.toString());
          await vscode.window.showTextDocument(untitled, {
            viewColumn: vscode.ViewColumn.Active,
            preview: false,
            preserveFocus: false,
          });
          InfographicEditorPanel.createOrShow(untitled, context);
          SyncService.setupSync(untitled.uri, uri, contentRange, content);
        } catch (e) {
          void vscode.window.showErrorMessage(
            `打开 Infographic 编辑器失败：${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    )
  );

  context.subscriptions.push({
    dispose: () => {
      SyncService.disposeAll();
      TempFileCache.clear(context);
    },
  });

  return { extendMarkdownIt };
}

export function deactivate() {}
