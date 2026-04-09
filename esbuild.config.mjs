// @ts-check
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

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

const previewCtx = await esbuild.context({
  entryPoints: [join(__dirname, 'src/preview.ts')],
  bundle: true,
  outfile: join(__dirname, 'dist/preview.js'),
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
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
  await Promise.all([extensionCtx.watch(), previewCtx.watch(), editorWebviewCtx.watch()]);
  console.log('watching extension + preview + editor webview…');
} else {
  await Promise.all([extensionCtx.rebuild(), previewCtx.rebuild(), editorWebviewCtx.rebuild()]);
  await Promise.all([extensionCtx.dispose(), previewCtx.dispose(), editorWebviewCtx.dispose()]);
}
