import * as vscode from 'vscode';
import { TempFileCache } from './tempFileCache';
import { SyncService } from './syncService';

export class SaveHandler {
  constructor(private readonly context: vscode.ExtensionContext) {}

  register(): vscode.Disposable {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      vscode.workspace.onWillSaveTextDocument((event) => {
        const document = event.document;
        const uri = document.uri.toString();
        if (!TempFileCache.has(this.context, uri)) {
          return;
        }
        const tracking = SyncService.getTrackingByBufferUri(document.uri);
        if (tracking) {
          event.waitUntil(this.syncTempBufferToMarkdown(document));
        }
      })
    );

    return vscode.Disposable.from(...disposables);
  }

  private async syncTempBufferToMarkdown(document: vscode.TextDocument): Promise<void> {
    const tracking = SyncService.getTrackingByBufferUri(document.uri);
    if (!tracking) {
      return;
    }
    try {
      const content = document.getText();
      const edit = new vscode.WorkspaceEdit();
      edit.replace(tracking.sourceUri, tracking.sourceRange, content);
      const ok = await vscode.workspace.applyEdit(edit);
      if (ok) {
        tracking.lastSyncContent = content;
        const sourceDoc = await vscode.workspace.openTextDocument(tracking.sourceUri);
        await sourceDoc.save();
      }
    } catch (e) {
      vscode.window.showErrorMessage(
        `保存时同步 Markdown 失败：${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
}
