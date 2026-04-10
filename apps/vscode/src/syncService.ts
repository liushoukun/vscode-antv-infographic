import * as vscode from 'vscode';
import { debounce } from './debounce';

export interface SyncTracking {
  bufferUri: vscode.Uri;
  sourceUri: vscode.Uri;
  sourceRange: vscode.Range;
  blockKey: string;
  lastSyncContent: string;
  disposables: vscode.Disposable[];
  isSyncing: boolean;
}

export class SyncService {
  private static trackingMap = new Map<string, SyncTracking>();
  private static readonly DEBOUNCE_MS = 500;

  static setupSync(
    bufferUri: vscode.Uri,
    sourceUri: vscode.Uri,
    sourceRange: vscode.Range,
    initialContent: string
  ): void {
    const blockKey = `${sourceUri.toString()}#${sourceRange.start.line}-${sourceRange.end.line}`;
    if (this.trackingMap.has(blockKey)) {
      return;
    }

    const disposables: vscode.Disposable[] = [];
    const debouncedSyncToSource = debounce(async (newContent: string) => {
      await this.syncBufferToSource(blockKey, newContent);
    }, this.DEBOUNCE_MS);

    disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== bufferUri.toString()) {
          return;
        }
        const tracking = this.trackingMap.get(blockKey);
        if (!tracking || tracking.isSyncing) {
          return;
        }
        const newContent = e.document.getText();
        if (newContent === tracking.lastSyncContent) {
          return;
        }
        debouncedSyncToSource(newContent);
      })
    );

    disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== sourceUri.toString()) {
          return;
        }
        const tracking = this.trackingMap.get(blockKey);
        if (!tracking || tracking.isSyncing) {
          return;
        }
        const expanded = new vscode.Range(
          new vscode.Position(Math.max(0, sourceRange.start.line - 5), 0),
          new vscode.Position(sourceRange.end.line + 10, 0)
        );
        const affects = e.contentChanges.some((ch) => ch.range.intersection(expanded) !== undefined);
        if (affects) {
          void this.handleSourceChange(blockKey);
        }
      })
    );

    disposables.push(
      vscode.workspace.onDidCloseTextDocument((doc) => {
        if (doc.uri.toString() === bufferUri.toString()) {
          this.cleanup(blockKey);
        }
      })
    );

    this.trackingMap.set(blockKey, {
      bufferUri,
      sourceUri,
      sourceRange,
      blockKey,
      lastSyncContent: initialContent,
      disposables,
      isSyncing: false,
    });
  }

  private static async recalculateSourceRange(tracking: SyncTracking): Promise<vscode.Range | undefined> {
    try {
      const sourceDoc = await vscode.workspace.openTextDocument(tracking.sourceUri);
      const lines = sourceDoc.getText().split('\n');
      const hint = tracking.sourceRange.start.line;
      const searchStart = Math.max(0, hint - 10);
      const searchEnd = Math.min(lines.length, hint + 50);
      const re = /^```infographic\s*$/i;
      for (let i = searchStart; i < searchEnd; i++) {
        if (!re.test(lines[i].trim())) {
          continue;
        }
        let close = i + 1;
        while (close < lines.length && lines[close].trim() !== '```') {
          close++;
        }
        if (close >= lines.length) {
          continue;
        }
        if (Math.abs(i - hint) <= 10) {
          return new vscode.Range(new vscode.Position(i + 1, 0), new vscode.Position(close, 0));
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private static async syncBufferToSource(blockKey: string, newContent: string): Promise<void> {
    const tracking = this.trackingMap.get(blockKey);
    if (!tracking) {
      return;
    }
    try {
      tracking.isSyncing = true;
      const updated = await this.recalculateSourceRange(tracking);
      if (!updated) {
        vscode.window.showWarningMessage('未在 Markdown 中找到对应的 infographic 代码块，已停止同步。');
        this.cleanup(blockKey);
        return;
      }
      tracking.sourceRange = updated;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(tracking.sourceUri, updated, newContent);
      const ok = await vscode.workspace.applyEdit(edit);
      if (ok) {
        tracking.lastSyncContent = newContent;
      }
    } catch (e) {
      vscode.window.showErrorMessage(`同步到 Markdown 失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      tracking.isSyncing = false;
    }
  }

  private static async handleSourceChange(blockKey: string): Promise<void> {
    const tracking = this.trackingMap.get(blockKey);
    if (!tracking) {
      return;
    }
    try {
      const updated = await this.recalculateSourceRange(tracking);
      if (!updated) {
        this.cleanup(blockKey);
        return;
      }
      tracking.sourceRange = updated;
      const sourceDoc = await vscode.workspace.openTextDocument(tracking.sourceUri);
      const sourceContent = sourceDoc.getText(updated);
      const bufferDoc = await vscode.workspace.openTextDocument(tracking.bufferUri);
      const bufferContent = bufferDoc.getText();
      if (sourceContent !== bufferContent) {
        await this.syncSourceToBuffer(blockKey, sourceContent);
      }
    } catch {
      /* ignore */
    }
  }

  private static async syncSourceToBuffer(blockKey: string, newContent: string): Promise<void> {
    const tracking = this.trackingMap.get(blockKey);
    if (!tracking) {
      return;
    }
    try {
      tracking.isSyncing = true;
      const bufferDoc = await vscode.workspace.openTextDocument(tracking.bufferUri);
      const full = new vscode.Range(
        bufferDoc.positionAt(0),
        bufferDoc.positionAt(bufferDoc.getText().length)
      );
      const edit = new vscode.WorkspaceEdit();
      edit.replace(tracking.bufferUri, full, newContent);
      const ok = await vscode.workspace.applyEdit(edit);
      if (ok) {
        tracking.lastSyncContent = newContent;
      }
    } finally {
      tracking.isSyncing = false;
    }
  }

  static cleanup(blockKey: string): void {
    const tracking = this.trackingMap.get(blockKey);
    if (!tracking) {
      return;
    }
    tracking.disposables.forEach((d) => d.dispose());
    this.trackingMap.delete(blockKey);
  }

  static disposeAll(): void {
    for (const k of [...this.trackingMap.keys()]) {
      this.cleanup(k);
    }
  }

  static getTrackingByBufferUri(bufferUri: vscode.Uri): SyncTracking | undefined {
    for (const t of this.trackingMap.values()) {
      if (t.bufferUri.toString() === bufferUri.toString()) {
        return t;
      }
    }
    return undefined;
  }
}
