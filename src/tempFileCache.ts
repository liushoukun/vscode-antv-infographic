import * as vscode from 'vscode';

const CACHE_KEY = 'antvInfographicTempFileUris';

export class TempFileCache {
  static getAll(context: vscode.ExtensionContext): string[] {
    return context.globalState.get<string[]>(CACHE_KEY, []);
  }

  static add(context: vscode.ExtensionContext, uri: string): void {
    const uris = this.getAll(context);
    if (!uris.includes(uri)) {
      uris.push(uri);
      void context.globalState.update(CACHE_KEY, uris);
    }
  }

  static remove(context: vscode.ExtensionContext, uri: string): void {
    const uris = this.getAll(context).filter((u) => u !== uri);
    void context.globalState.update(CACHE_KEY, uris);
  }

  static has(context: vscode.ExtensionContext, uri: string): boolean {
    return this.getAll(context).includes(uri);
  }

  static clear(context: vscode.ExtensionContext): void {
    void context.globalState.update(CACHE_KEY, []);
  }
}
