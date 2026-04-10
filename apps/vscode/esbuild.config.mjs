// @ts-check
import * as esbuild from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, watch as fsWatchFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const previewBundle = join(__dirname, '../../packages/preview-web/dist/preview.js');
const previewOut = join(__dirname, 'dist/preview.js');

function copyPreviewJs() {
  if (!existsSync(previewBundle)) {
    throw new Error(
      '缺少共享预览包：请先于仓库根目录执行 pnpm run build 或 pnpm --filter @antv-infographic/preview-web run build',
    );
  }
  mkdirSync(dirname(previewOut), { recursive: true });
  copyFileSync(previewBundle, previewOut);
}

function watchPreviewBundle() {
  try {
    fsWatchFile(previewBundle, () => {
      try {
        copyPreviewJs();
        console.info('[vscode] 已同步 packages/preview-web/dist/preview.js');
      } catch (err) {
        console.error('[vscode] 同步 preview.js 失败', err);
      }
    });
  } catch {
    /* 首次构建前文件可能尚不存在，忽略 */
  }
}

const extensionCtx = await esbuild.context({
  entryPoints: [join(__dirname, 'src/extension.ts')],
  bundle: true,
  outfile: join(__dirname, 'dist/extension.js'),
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
  minify: false,
});

const editorWebviewCtx = await esbuild.context({
  entryPoints: [join(__dirname, 'src/editorWebview.ts')],
  bundle: true,
  outfile: join(__dirname, 'dist/editorWebview.js'),
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
});

if (watch) {
  copyPreviewJs();
  watchPreviewBundle();
  await Promise.all([extensionCtx.watch(), editorWebviewCtx.watch()]);
  console.log('watching extension + editor webview；并行运行 pnpm --filter @antv-infographic/preview-web run watch 以热更新 preview');
} else {
  await Promise.all([extensionCtx.rebuild(), editorWebviewCtx.rebuild()]);
  copyPreviewJs();
  await Promise.all([extensionCtx.dispose(), editorWebviewCtx.dispose()]);
}
