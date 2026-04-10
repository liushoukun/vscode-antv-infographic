import * as vscode from 'vscode';
import * as path from 'path';

export class InfographicGutterDecorationProvider {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    const iconPath = vscode.Uri.file(
      path.join(context.extensionPath, 'media', 'images', 'logo.svg')
    );
    this.decorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: iconPath,
      gutterIconSize: 'contain',
    });

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (ed) {
          this.apply(ed);
        }
      })
    );
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        const ed = vscode.window.activeTextEditor;
        if (ed && e.document === ed.document) {
          this.apply(ed);
        }
      })
    );

    if (vscode.window.activeTextEditor) {
      this.apply(vscode.window.activeTextEditor);
    }
  }

  private apply(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== 'markdown') {
      editor.setDecorations(this.decorationType, []);
      return;
    }
    const lines = editor.document.getText().split('\n');
    const re = /^```infographic\s*$/i;
    const opts: vscode.DecorationOptions[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i].trim())) {
        const line = editor.document.lineAt(i);
        opts.push({ range: line.range });
      }
    }
    editor.setDecorations(this.decorationType, opts);
  }

  dispose(): void {
    this.decorationType.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
