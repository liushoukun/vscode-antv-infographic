import * as vscode from 'vscode';

export class InfographicCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.languageId !== 'markdown') {
      return [];
    }
    const lenses: vscode.CodeLens[] = [];
    const lines = document.getText().split('\n');
    const re = /^```infographic\s*$/i;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!re.test(line.trim())) {
        i++;
        continue;
      }
      const startLine = i;
      let endLine = i + 1;
      let inner = '';
      while (endLine < lines.length && lines[endLine].trim() !== '```') {
        inner += `${lines[endLine]}\n`;
        endLine++;
      }
      if (inner.trim().length > 0) {
        const fenceRange = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(startLine, line.length)
        );
        const contentRange = new vscode.Range(
          new vscode.Position(startLine + 1, 0),
          new vscode.Position(endLine, 0)
        );
        lenses.push(
          new vscode.CodeLens(fenceRange, {
            title: 'Edit Infographic',
            tooltip: '在侧栏打开可视化编辑与预览',
            command: 'antvInfographic.editBlock',
            arguments: [document.uri, contentRange],
          })
        );
      }
      i = endLine < lines.length ? endLine + 1 : endLine;
    }
    return lenses;
  }

  refresh(): void {
    this._onDidChange.fire();
  }
}
