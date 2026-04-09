import type MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import * as vscode from 'vscode';
import { InfographicCodeLensProvider } from './codeLensProvider';
import { InfographicGutterDecorationProvider } from './gutterDecorationProvider';
import { InfographicEditorPanel } from './infographicEditorPanel';
import { SaveHandler } from './saveHandler';
import { SyncService } from './syncService';
import { TempFileCache } from './tempFileCache';

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
      const escaped = md.utils.escapeHtml(token.content);
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
