// @ts-check
import * as esbuild from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, watch as fsWatchFile } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const previewBundle = join(__dirname, '../../packages/preview-web/dist/preview.js');
const previewCssSource = join(__dirname, '../../packages/preview-web/preview.css');
const previewOut = join(__dirname, 'dist/preview.js');
const previewCssOut = join(__dirname, 'media/preview.css');

function copyPreviewJs() {
  if (!existsSync(previewBundle)) {
    throw new Error(
      '缺少共享预览包：请先于仓库根目录执行 pnpm run build 或 pnpm --filter @antv-infographic/preview-web run build',
    );
  }
  mkdirSync(dirname(previewOut), { recursive: true });
  copyFileSync(previewBundle, previewOut);
}

function copyPreviewCss() {
  if (!existsSync(previewCssSource)) {
    throw new Error('缺少 packages/preview-web/preview.css');
  }
  mkdirSync(dirname(previewCssOut), { recursive: true });
  copyFileSync(previewCssSource, previewCssOut);
}

function copyPreviewWebArtifacts() {
  copyPreviewJs();
  copyPreviewCss();
}

function watchPreviewWebArtifacts() {
  const sync = () => {
    try {
      copyPreviewWebArtifacts();
      console.info('[vscode] 已同步 preview-web 的 preview.js / preview.css');
    } catch (err) {
      console.error('[vscode] 同步 preview-web 资源失败', err);
    }
  };
  try {
    fsWatchFile(previewBundle, sync);
  } catch {
    /* 首次构建前可能尚不存在 */
  }
  try {
    fsWatchFile(previewCssSource, sync);
  } catch {
    /* ignore */
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
  copyPreviewWebArtifacts();
  watchPreviewWebArtifacts();
  await Promise.all([extensionCtx.watch(), editorWebviewCtx.watch()]);
  console.log('watching extension + editor webview；并行运行 pnpm --filter @antv-infographic/preview-web run watch 以热更新 preview.js');
} else {
  await Promise.all([extensionCtx.rebuild(), editorWebviewCtx.rebuild()]);
  copyPreviewWebArtifacts();
  await Promise.all([extensionCtx.dispose(), editorWebviewCtx.dispose()]);
}
