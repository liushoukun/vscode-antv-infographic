import * as path from 'node:path';
import * as vscode from 'vscode';
import { debounce } from './debounce';

function nonce(): string {
  let t = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    t += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return t;
}

export class InfographicEditorPanel {
  private static current: InfographicEditorPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private document: vscode.TextDocument;
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  private constructor(
    panel: vscode.WebviewPanel,
    document: vscode.TextDocument,
    private readonly context: vscode.ExtensionContext
  ) {
    this.panel = panel;
    this.document = document;
    this.bootstrapHtml();
    this.wire();
  }

  static createOrShow(document: vscode.TextDocument, context: vscode.ExtensionContext): void {
    if (InfographicEditorPanel.current && !InfographicEditorPanel.current.disposed) {
      InfographicEditorPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      if (InfographicEditorPanel.current.document.uri.toString() !== document.uri.toString()) {
        InfographicEditorPanel.current.document = document;
        InfographicEditorPanel.current.pushUpdate();
      }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'antvInfographicEditor',
      'Infographic 编辑',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
          vscode.Uri.joinPath(context.extensionUri, 'media'),
        ],
      }
    );
    InfographicEditorPanel.current = new InfographicEditorPanel(panel, document, context);
  }

  private bootstrapHtml(): void {
    const n = nonce();
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'editorWebview.js')
    );
    const wc = this.panel.webview.cspSource;
    const csp = [
      `default-src 'none';`,
      /* AntV PNG 导出在内部用 Image 加载 data:/blob: SVG，须放行（否则报 Image load failed） */
      `img-src data: blob: ${wc};`,
      /* hand-drawn 主题可能通过远程样式/字体加载中文手写字形 */
      `font-src data: https: ${wc};`,
      `style-src https: ${wc} 'unsafe-inline';`,
      `connect-src https: ${wc};`,
      `script-src 'nonce-${n}';`,
    ].join(' ');
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Infographic</title>
  <style>
    body { margin: 0; padding: 8px; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
    #err { display: none; padding: 10px; margin-bottom: 8px; background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); border-radius: 4px; white-space: pre-wrap; flex-shrink: 0; }
    #root { flex: 1; min-height: 0; width: 100%; position: relative; }
    /* 图表区：仅布局容器，不设置边框/背景/内边距等渲染样式 */
    .ig-stage { position: relative; width: 100%; height: 100%; }
    .ig-viewport { position: absolute; inset: 0; overflow: hidden; }
    .ig-panzoom { width: 100%; min-height: 100%; box-sizing: border-box; }
    .ig-host { display: inline-block; max-width: 100%; }
    .ig-left-bar, .ig-right-bar {
      --ig-divider: var(--vscode-panel-border, #e1e5e9);
      --ig-hover-bg: var(--vscode-toolbar-hoverBackground, rgba(0,0,0,0.1));
      --ig-active-bg: var(--vscode-button-background, #0078d4);
      --ig-active-fg: var(--vscode-button-foreground, #ffffff);
    }
    .ig-left-bar.ig-chrome-dark, .ig-right-bar.ig-chrome-dark {
      --ig-divider: var(--vscode-panel-border, #464647);
      --ig-hover-bg: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
    }
    .ig-left-bar { position: absolute; top: 8px; left: 16px; z-index: 100; display: flex; flex-direction: row; align-items: center; gap: 4px; border-radius: 4px; border: 1px solid var(--ig-border, #ddd); background: var(--ig-sidebar-bg, #fff); padding: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
    .ig-toolbar-divider { width: 1px; align-self: stretch; min-height: 24px; background: var(--ig-divider); margin: 0 2px; }
    .ig-theme-container, .ig-palette-container { position: relative; display: flex; align-items: center; }
    .ig-theme-menu {
      position: absolute; top: 100%; left: 0; margin-top: 4px; min-width: 200px; z-index: 200;
      background: var(--vscode-editorWidget-background, var(--ig-sidebar-bg));
      border: 1px solid var(--vscode-editorWidget-border, var(--ig-border));
      border-radius: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.15); padding: 4px 0; max-height: 280px; overflow-y: auto;
    }
    .ig-theme-item {
      display: block; width: 100%; text-align: left; padding: 8px 14px; border: none; background: none;
      font-size: 12px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); cursor: pointer;
    }
    .ig-theme-item:hover { background: var(--ig-hover-bg); }
    .ig-theme-item-selected { background: var(--vscode-list-activeSelectionBackground, #04395e); color: var(--vscode-list-activeSelectionForeground, #fff); }
    .ig-right-bar { position: absolute; top: 8px; right: 16px; z-index: 100; display: flex; flex-direction: row; align-items: center; gap: 0; background: var(--ig-sidebar-bg, #fff); border: 1px solid var(--ig-border, #ddd); padding: 4px; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
    .ig-hand-section { display: flex; align-items: center; padding-right: 4px; border-right: 1px solid var(--ig-divider); margin-right: 4px; }
    .ig-zoom-controls { display: flex; align-items: center; gap: 4px; padding-right: 4px; border-right: 1px solid var(--ig-divider); margin-right: 8px; }
    /* 与 Mermaid Chart Sidebar.svelte：32×32 按钮内 24×24 SVG、block 避免基线裁切 */
    .ig-mc-icon {
      cursor: pointer; border: none; background: none; color: var(--ig-svg-color, #3b3b3b); border-radius: 4px;
      transition: background-color 0.2s ease; padding: 4px; width: 32px; height: 32px; box-sizing: border-box;
      display: inline-flex; align-items: center; justify-content: center; line-height: 0; overflow: visible;
    }
    .ig-mc-icon svg { width: 24px; height: 24px; display: block; flex-shrink: 0; }
    .ig-mc-icon:hover { background-color: var(--ig-hover-bg); }
    .ig-mc-icon.ig-mc-icon-active {
      background-color: var(--ig-active-bg) !important;
      color: var(--ig-active-fg) !important;
      box-shadow: none;
    }
    .ig-mc-icon.ig-mc-icon-active:hover { background-color: var(--vscode-button-hoverBackground, var(--ig-active-bg)) !important; }
    .ig-zoom-level { font-size: 14px; font-weight: 400; padding: 0 4px; user-select: none; color: var(--ig-svg-color, #3b3b3b); font-family: var(--vscode-font-family); }
    /* Mermaid Chart ExportModal 对齐 */
    .ig-mc-modal-root { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1000; align-items: center; justify-content: center; }
    .ig-mc-modal-backdrop {
      position: absolute; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box;
    }
    .ig-mc-modal-content {
      background: var(--modal-bg); border: 1px solid var(--modal-border); border-radius: 6px; width: 520px; max-width: 90vw; max-height: 85vh;
      overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4); display: flex; flex-direction: column; font-family: var(--vscode-font-family);
    }
    .ig-mc-modal-content.light {
      --modal-bg: #ffffff; --modal-border: #c8c8c8; --text-primary: #3b3b3b; --text-secondary: #6e6e6e; --section-border: #d4d4d4;
      --selected-bg: #0060c0; --input-bg: #e8e8e8; --hover-bg: #e8e8e8; --input-border: #d4d4d4;
      --button-primary-bg: #0e639c; --button-primary-hover: #1177bb; --button-secondary-bg: #e4e4e4; --button-secondary-border: #d4d4d4; --button-secondary-hover: #e8e8e8;
      --copy-button-bg: #e4e4e4; --copy-button-bg-hover: #ebebeb;
    }
    .ig-mc-modal-content.dark {
      --modal-bg: #1f1f1f; --modal-border: #454545; --text-primary: #cccccc; --text-secondary: #9d9d9d; --section-border: #3e3e42;
      --selected-bg: #04395e; --input-bg: #2b2b2b; --hover-bg: #2b2b2b; --input-border: #464647;
      --button-primary-bg: #0e639c; --button-primary-hover: #1177bb; --button-secondary-bg: #313131; --button-secondary-border: #404040; --button-secondary-hover: #3a3a3a;
      --copy-button-bg: #2a2d2e; --copy-button-bg-hover: #333638;
    }
    .ig-mc-modal-header { padding: 12px 12px 0 12px; position: relative; background: var(--modal-bg); }
    .ig-mc-modal-title { font-size: 16px; font-weight: 400; margin: 0 32px 8px 0; color: var(--text-primary); }
    .ig-mc-close-button {
      position: absolute; top: 8px; right: 6px; background: none; border: none; font-size: 18px; cursor: pointer;
      color: var(--text-primary); padding: 6px; border-radius: 3px; line-height: 1;
    }
    .ig-mc-close-button:hover { background-color: var(--hover-bg); }
    .ig-mc-modal-body { padding: 12px; display: flex; gap: 20px; flex: 1; overflow-y: auto; min-height: 0; }
    .ig-mc-export-options { flex: 1; min-width: 0; }
    .ig-mc-preview-section { flex: 1.5; display: flex; flex-direction: column; min-width: 0; }
    .ig-mc-option-group { margin-bottom: 16px; }
    .ig-mc-option-group-title { font-size: 12px; font-weight: 400; color: var(--text-primary); letter-spacing: 0.5px; margin-bottom: 8px; }
    .ig-mc-format-options { display: flex; flex-direction: column; gap: 8px; }
    .ig-mc-radio-option {
      display: flex; align-items: flex-start; background-color: var(--input-bg); gap: 10px; padding: 10px; border-radius: 4px;
      cursor: pointer; border: 1px solid transparent;
    }
    .ig-mc-radio-option:hover { background-color: var(--hover-bg); }
    .ig-mc-radio-option.selected { background-color: var(--selected-bg); color: #ffffff; }
    .ig-mc-radio-input {
      appearance: none; -webkit-appearance: none; width: 12px; height: 12px; border: 1.5px solid #ccc; border-radius: 50%; margin-top: 2px; flex-shrink: 0; cursor: pointer;
    }
    .ig-mc-radio-option.selected .ig-mc-radio-input { border-color: #fff; }
    .ig-mc-radio-option.selected .ig-mc-radio-input::after {
      content: ''; display: block; width: 6px; height: 6px; margin: 2px auto; border-radius: 50%; background: #fff;
    }
    .ig-mc-radio-label { font-size: 12px; font-weight: 500; color: var(--text-primary); display: block; }
    .ig-mc-radio-description { font-size: 10px; line-height: 1.3; color: var(--text-secondary); display: block; }
    .ig-mc-radio-option.selected .ig-mc-radio-label,
    .ig-mc-radio-option.selected .ig-mc-radio-description { color: #fff; }
    .ig-mc-background-color-options { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .ig-mc-color-option {
      width: 28px; height: 28px; border-radius: 4px; cursor: pointer; border: 1px solid var(--section-border); padding: 0; box-sizing: border-box;
    }
    .ig-mc-color-option.selected { box-shadow: 0 0 0 2px var(--selected-bg); }
    .ig-mc-background-light { background: #fff; border-color: #d4d4d4; }
    .ig-mc-background-dark { background: #1a1a1a; border-color: #3e3e42; }
    .ig-mc-background-transparent {
      background: linear-gradient(45deg,#f0f0f0 25%,transparent 25%),linear-gradient(-45deg,#f0f0f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f0f0f0 75%),linear-gradient(-45deg,transparent 75%,#f0f0f0 75%);
      background-size: 8px 8px; background-position: 0 0,0 4px,4px -4px,-4px 0; background-color: #fff; border-color: #d4d4d4;
    }
    .ig-mc-background-custom {
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg,#ff6b6b,#4ecdc4,#45b7d1); border-color: var(--section-border);
    }
    .ig-mc-custom-color-picker {
      margin-top: 10px; padding: 10px 12px; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 4px;
      align-items: center; justify-content: space-between; gap: 12px;
    }
    .ig-mc-color-picker-container { display: flex; align-items: center; gap: 8px; }
    .ig-mc-color-input { width: 32px; height: 24px; border: 1px solid var(--input-border); border-radius: 4px; padding: 0; cursor: pointer; }
    .ig-mc-color-picker-text { font-size: 12px; font-weight: 500; color: var(--text-primary); }
    .ig-mc-color-value {
      font-size: 11px; font-family: monospace; text-transform: uppercase; color: var(--text-secondary);
      padding: 4px 6px; border-radius: 3px; border: 1px solid var(--input-border); background: var(--input-bg);
    }
    .ig-mc-preview-title { font-size: 12px; font-weight: 400; color: var(--text-primary); letter-spacing: 0.5px; margin-bottom: 8px; }
    .ig-mc-preview-container {
      border: 1px solid var(--section-border); border-radius: 4px; min-height: 220px; max-height: 250px; height: 250px;
      display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; flex-shrink: 0; background: #fff;
    }
    .ig-mc-preview-container.ig-mc-preview-transparent-bg {
      background: linear-gradient(45deg,#f0f0f0 25%,transparent 25%),linear-gradient(-45deg,#f0f0f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f0f0f0 75%),linear-gradient(-45deg,transparent 75%,#f0f0f0 75%);
      background-size: 12px 12px; background-position: 0 0,0 6px,6px -6px,-6px 0; background-color: #fff;
    }
    .ig-mc-preview-content {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 8px; box-sizing: border-box;
    }
    .ig-mc-preview-placeholder { color: var(--text-secondary); font-size: 11px; text-align: center; white-space: pre-line; padding: 12px; }
    .ig-mc-copy-button {
      position: absolute; top: 8px; right: 8px; background: var(--copy-button-bg); border: 1px solid rgba(0,0,0,0.1);
      cursor: pointer; padding: 8px; border-radius: 6px; display: flex; align-items: center; justify-content: center; z-index: 10; color: var(--text-primary);
    }
    .ig-mc-copy-button:hover { background: var(--copy-button-bg-hover); }
    .ig-mc-modal-content.dark .ig-mc-copy-button { border-color: rgba(255,255,255,0.1); }
    .ig-mc-modal-footer { padding: 0 12px 12px 12px; display: flex; justify-content: flex-end; gap: 8px; background: var(--modal-bg); flex-shrink: 0; }
    .ig-mc-button {
      padding: 8px 16px; border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer; min-width: 70px;
      border: 1px solid transparent; font-family: var(--vscode-font-family);
    }
    .ig-mc-button-secondary { background: var(--button-secondary-bg); border-color: var(--button-secondary-border); color: var(--text-primary); }
    .ig-mc-button-secondary:hover { background: var(--button-secondary-hover); }
    .ig-mc-button-primary { background: var(--button-primary-bg); border-color: var(--button-primary-bg); color: #fff; }
    .ig-mc-button-primary:hover { background: var(--button-primary-hover); border-color: var(--button-primary-hover); }
  </style>
</head>
<body>
  <div id="err"></div>
  <div id="root"></div>
  <script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private wire(): void {
    const debouncedDoc = debounce(() => this.pushUpdate(), 280);

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg?.type === 'ready') {
          this.pushUpdate();
          return;
        }
        if (msg?.type === 'visualEdit' && typeof msg.content === 'string') {
          await this.applyFromWebview(msg.content as string);
          return;
        }
        if (msg?.type === 'exportPng' && typeof msg.pngBase64 === 'string') {
          await this.savePng(msg.pngBase64 as string);
          return;
        }
        if (msg?.type === 'exportSvg' && typeof msg.svgText === 'string') {
          await this.saveSvgText(msg.svgText as string);
          return;
        }
        if (msg?.type === 'error' && typeof msg.message === 'string') {
          void vscode.window.showErrorMessage(`Infographic：${msg.message as string}`);
          return;
        }
        if (msg?.type === 'showWarning' && typeof msg.message === 'string') {
          void vscode.window.showWarningMessage(`Infographic：${msg.message as string}`);
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() === this.document.uri.toString()) {
          debouncedDoc();
        }
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (ed?.document.languageId === 'infographic') {
          if (ed.document.uri.toString() !== this.document.uri.toString()) {
            this.document = ed.document;
            debouncedDoc();
          }
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('antvInfographic')) {
          return;
        }
        this.pushUpdate();
      })
    );

    this.disposables.push(this.panel.onDidDispose(() => this.dispose()));
  }

  private exportStem(): string {
    const fn = this.document.fileName;
    const stem = path.basename(fn, path.extname(fn));
    return stem.length > 0 ? stem : 'infographic';
  }

  private defaultExportUri(ext: 'png' | 'svg'): vscode.Uri {
    const stem = this.exportStem();
    const name = `${stem}.${ext}`;
    if (this.document.uri.scheme === 'file') {
      return vscode.Uri.file(path.join(path.dirname(this.document.uri.fsPath), name));
    }
    return vscode.Uri.file(name);
  }

  private async savePng(pngBase64: string): Promise<void> {
    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: this.defaultExportUri('png'),
        filters: { PNG: ['png'] },
        saveLabel: '保存',
      });
      if (!uri) {
        return;
      }
      const buf = Buffer.from(pngBase64, 'base64');
      await vscode.workspace.fs.writeFile(uri, buf);
      void vscode.window.showInformationMessage('PNG 已保存。');
    } catch (e) {
      void vscode.window.showErrorMessage(
        `保存 PNG 失败：${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  private async saveSvgText(svgText: string): Promise<void> {
    try {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: this.defaultExportUri('svg'),
        filters: { SVG: ['svg'] },
        saveLabel: '保存',
      });
      if (!uri) {
        return;
      }
      await vscode.workspace.fs.writeFile(uri, Buffer.from(svgText, 'utf8'));
      void vscode.window.showInformationMessage('SVG 已保存。');
    } catch (e) {
      void vscode.window.showErrorMessage(
        `保存 SVG 失败：${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  private async applyFromWebview(text: string): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(this.document.uri);
      this.document = doc;
      const full = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, full, text);
      await vscode.workspace.applyEdit(edit);
    } catch (e) {
      void vscode.window.showErrorMessage(
        `应用可视化编辑失败：${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  private pushUpdate(): void {
    if (this.disposed) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration('antvInfographic');
    const width = cfg.get<string | number>('editorWidth', '100%');
    const height = cfg.get<number>('editorHeight', 480);
    const content = this.document.getText() || '';
    void this.panel.webview.postMessage({
      type: 'update',
      content,
      width,
      height,
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    InfographicEditorPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }
}
