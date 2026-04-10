import { Infographic, getPalettes, getThemes, type InfographicOptions } from '@antv/infographic';
import Panzoom from '@panzoom/panzoom';
import { debounce } from './debounce';
import { serializeInfographicDsl } from './serializeInfographicDsl';
import {
  exportPngWithInfographicFallback,
  exportSvgWithInfographicFallback,
  getBase64SVGAsync,
  getDiagramSvg,
  getExportBackgroundColorMc,
  getPreviewBackgroundColorMc,
  uniquifyCloneIds,
  waitForFontsReady,
} from './webviewExportMc';
import {
  MC_TOOLBAR_FIT_SVG,
  MC_TOOLBAR_HAND_SVG,
  MC_TOOLBAR_ZOOM_IN_SVG,
  MC_TOOLBAR_ZOOM_OUT_SVG,
} from './mcToolbarIcons';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();

const rootEl = document.getElementById('root');
const errEl = document.getElementById('err');

let ig: Infographic | undefined;
let pendingEcho = '';
let lastRendered = '';
/** 最近一次来自编辑器的 DSL（用于主题切换时重新 render） */
let lastDsl = '';
let lastW: number | string = '100%';
let lastH: number | string = 480;
/**
 * null = default ；
 * 'light' = @antv/infographic 内置默认（DEFAULT_OPTIONS.theme）；
 * 其它为已注册主题名（如 dark、hand-drawn）。
 */
let themeOverride: string | null = null;
/** null = default DSL；否则为色板名覆盖（getPalettes 的键） */
let paletteOverride: string | null = null;

let panzoomInst: ReturnType<typeof Panzoom> | undefined;
let wheelOnViewport: ((e: WheelEvent) => void) | undefined;
let zoomLabelEl: HTMLElement | undefined;
let panEnabled = false;
let themeMenuOpen = false;
let themeOutsideHandler: ((e: MouseEvent) => void) | undefined;
let paletteMenuOpen = false;
let paletteOutsideHandler: ((e: MouseEvent) => void) | undefined;

/** 与 Mermaid 预览 Sidebar / LeftSideBar 一致的配色（随 VS Code 明暗切换） */
function applyMermaidLikeChromeColors() {
  const root = document.documentElement;
  const dark =
    document.body.classList.contains('vscode-dark') ||
    document.body.getAttribute('data-vscode-theme-kind') === 'vscode-dark';
  root.style.setProperty('--ig-sidebar-bg', dark ? '#1e1e1e' : '#ffffff');
  root.style.setProperty('--ig-icon-bg', dark ? '#1e1e1e' : '#ffffff');
  root.style.setProperty('--ig-shadow', dark ? '#6b6b6b' : '#A3BDFF');
  root.style.setProperty('--ig-svg-color', dark ? '#ffffff' : '#3b3b3b');
  root.style.setProperty('--ig-border', dark ? '#464647' : '#dddddd');
  document.querySelectorAll('.ig-left-bar, .ig-right-bar').forEach((el) => {
    el.classList.toggle('ig-chrome-dark', dark);
  });
}

function showError(msg: string) {
  if (errEl) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
  vscode.postMessage({ type: 'error', message: msg });
}

function clearError() {
  if (errEl) {
    errEl.textContent = '';
    errEl.style.display = 'none';
  }
}

function updateZoomLabel() {
  if (!zoomLabelEl) {
    return;
  }
  const pct = panzoomInst ? Math.round(panzoomInst.getScale() * 100) : 100;
  zoomLabelEl.textContent = `Zoom ${pct}%`;
}

/** 主题下拉展示为英文（与文档/DSL 中的 theme id 一致） */
const THEME_LABELS: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  'hand-drawn': 'Hand drawn',
};

function themeDisplayName(id: string): string {
  return THEME_LABELS[id] ?? id;
}

/** 解析根级 `theme`（与 @antv/infographic DSL 一致）：`theme dark` 或 `theme` 块内 `type …` 及同级键 */
function parseRootThemeFromDsl(dsl: string): { theme?: string; themeConfig?: Record<string, string> } | undefined {
  const lines = dsl.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s/.test(line)) {
      continue;
    }
    const m = line.match(/^theme(?:\s+(\S+))?\s*$/);
    if (!m) {
      continue;
    }
    if (m[1]) {
      return { theme: m[1] };
    }
    const entries: Record<string, string> = {};
    for (let j = i + 1; j < lines.length; j++) {
      const L = lines[j];
      if (!/^\s+\S/.test(L)) {
        break;
      }
      const t = L.trim();
      const sp = t.split(/\s+/);
      if (sp.length >= 2) {
        const k = sp[0];
        const v = sp.slice(1).join(' ');
        entries[k] = v;
      }
    }
    const { type, ...rest } = entries;
    const theme = typeof type === 'string' && type ? type : undefined;
    const themeConfig = Object.keys(rest).length > 0 ? rest : undefined;
    if (theme || themeConfig) {
      return { ...(theme ? { theme } : {}), ...(themeConfig ? { themeConfig } : {}) };
    }
    return undefined;
  }
  return undefined;
}

/**
 * 侧栏预览覆盖：主题 / 配色（与 DSL 默认分离，写回由 options:change → pushVisual 序列化）。
 */
function applyEditorPreviewOverrides(igInstance: Infographic) {
  const patch: Partial<InfographicOptions> = {};
  if (themeOverride !== null) {
    patch.theme = themeOverride;
  } else {
    const parsed = parseRootThemeFromDsl(lastDsl);
    if (parsed?.theme) {
      patch.theme = parsed.theme;
    }
    if (parsed?.themeConfig && Object.keys(parsed.themeConfig).length > 0) {
      const base = igInstance.getOptions();
      const prevTc =
        base.themeConfig && typeof base.themeConfig === 'object' ? { ...base.themeConfig } : {};
      patch.themeConfig = { ...prevTc, ...parsed.themeConfig };
    }
  }
  if (paletteOverride !== null) {
    const base = igInstance.getOptions();
    const prevTc =
      base.themeConfig && typeof base.themeConfig === 'object' ? { ...base.themeConfig } : {};
    patch.themeConfig = { ...prevTc, ...(patch.themeConfig ?? {}), palette: paletteOverride };
  }
  if (Object.keys(patch).length > 0) {
    igInstance.update(patch);
  }
}

function getInitialPreviewOptionsFromDsl(dsl: string): Pick<InfographicOptions, 'theme' | 'themeConfig'> {
  let theme: string | undefined;
  let themeConfig: Record<string, string> | undefined;

  if (themeOverride !== null) {
    theme = themeOverride;
  } else {
    const parsed = parseRootThemeFromDsl(dsl);
    theme = parsed?.theme;
    if (parsed?.themeConfig && Object.keys(parsed.themeConfig).length > 0) {
      themeConfig = { ...parsed.themeConfig };
    }
  }

  if (paletteOverride !== null) {
    themeConfig = { ...(themeConfig ?? {}), palette: paletteOverride };
  }

  return {
    ...(theme ? { theme } : {}),
    ...(themeConfig ? { themeConfig } : {}),
  };
}

/** 与 Mermaid-Chart vscode-mermaid-chart Sidebar 相同的 SVG（mask/clip 完整） */
function toolbarMcIcon(svgHtml: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ig-mc-icon ig-nopan';
  b.title = title;
  b.innerHTML = svgHtml;
  return b;
}

function ensurePanzoom(resetView: boolean) {
  const panEl = document.getElementById('ig-panzoom');
  const viewport = document.getElementById('ig-viewport');
  if (!panEl || !viewport) {
    return;
  }
  if (!panzoomInst) {
    panzoomInst = Panzoom(panEl, {
      maxScale: 5,
      minScale: 0.25,
      contain: 'outside',
      excludeClass: 'ig-nopan',
      panOnlyWhenZoomed: !panEnabled,
    });
    wheelOnViewport = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.ig-nopan')) {
        return;
      }
      panzoomInst?.zoomWithWheel(e);
    };
    viewport.addEventListener('wheel', wheelOnViewport, { passive: false });
    panEl.addEventListener('panzoomzoom', updateZoomLabel);
    panEl.addEventListener('panzoomend', updateZoomLabel);
    panEl.addEventListener('panzoomreset', updateZoomLabel);
  }
  if (resetView) {
    panzoomInst.reset({ animate: false });
  }
  updateZoomLabel();
}

function setPanMode(enabled: boolean) {
  panEnabled = enabled;
  const panBtn = document.getElementById('ig-btn-pan');
  panBtn?.classList.toggle('ig-mc-icon-active', enabled);
  if (panzoomInst) {
    panzoomInst.setOptions({
      panOnlyWhenZoomed: !enabled,
      disablePan: false,
    });
  }
  const viewport = document.getElementById('ig-viewport');
  if (viewport) {
    viewport.style.cursor = enabled ? 'grab' : '';
  }
}

function decodeSvgFromDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  const payload = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  if (dataUrl.includes(';base64,')) {
    return new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)));
  }
  return decodeURIComponent(payload);
}

function parseSvgRenderSize(svgText: string): { w: number; h: number } {
  const vb = /<svg[^>]*\bviewBox=["']([^"']+)["']/i.exec(svgText);
  if (vb) {
    const p = vb[1].trim().split(/[\s,]+/);
    if (p.length >= 4) {
      const w = parseFloat(p[2]);
      const h = parseFloat(p[3]);
      if (w > 0 && h > 0) {
        return { w, h };
      }
    }
  }
  const wm = /<svg[^>]*\bwidth=["']([^"'%]+)/i.exec(svgText);
  const hm = /<svg[^>]*\bheight=["']([^"'%]+)/i.exec(svgText);
  const w = wm ? parseFloat(wm[1]) : 800;
  const h = hm ? parseFloat(hm[1]) : 600;
  return { w: w > 0 ? w : 800, h: h > 0 ? h : 600 };
}

/** Webview CSP 常拦截 data: 图片；用 Blob URL 栅格化更稳 */
async function rasterizeSvgTextToPngBase64(
  svgText: string,
  opts?: { dpr?: number; background?: string | 'transparent' }
): Promise<string> {
  const dpr = opts?.dpr ?? 2;
  const background = opts?.background;
  const { w, h } = parseSvgRenderSize(svgText);
  let patched = svgText;
  if (!/\bwidth=/i.test(patched.split('>', 1)[0] ?? '')) {
    patched = patched.replace(/<svg\b/i, `<svg width="${w}" height="${h}" `);
  }
  const blob = new Blob([patched], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(
          new Error(
            '浏览器无法解码 SVG 位图（若图中含 foreignObject 等，部分环境不支持导出 PNG）。可先导出 SVG。'
          )
        );
      img.src = url;
    });
    const nw = img.naturalWidth || w;
    const nh = img.naturalHeight || h;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(nw * dpr));
    canvas.height = Math.max(1, Math.round(nh * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建 Canvas 上下文');
    }
    ctx.scale(dpr, dpr);
    if (background === 'transparent') {
      ctx.clearRect(0, 0, nw, nh);
    } else {
      ctx.fillStyle =
        background ??
        (document.body.classList.contains('vscode-dark') ||
        document.body.getAttribute('data-vscode-theme-kind') === 'vscode-dark'
          ? '#171719'
          : '#ffffff');
      ctx.fillRect(0, 0, nw, nh);
    }
    ctx.drawImage(img, 0, 0, nw, nh);
    const dataUrl = canvas.toDataURL('image/png', 0.92);
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
    return b64;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function injectSvgBackground(svgText: string, fill: string): string {
  const { w, h } = parseSvgRenderSize(svgText);
  const rect = `<rect x="0" y="0" width="${w}" height="${h}" fill="${fill}"/>`;
  return svgText.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => `<svg${attrs}>${rect}`);
}

const pushVisual = debounce(() => {
  if (!ig) {
    return;
  }
  try {
    const opts = ig.getOptions() as Record<string, unknown>;
    const text = serializeInfographicDsl(opts).trimEnd() + '\n';
    if (text === lastRendered) {
      return;
    }
    pendingEcho = text;
    vscode.postMessage({ type: 'visualEdit', content: text });
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
  }
}, 450);

function destroyIg() {
  if (ig) {
    try {
      ig.destroy();
    } catch {
      /* ignore */
    }
    ig = undefined;
  }
}

function closeThemeMenu(menu: HTMLElement) {
  themeMenuOpen = false;
  menu.style.display = 'none';
  if (themeOutsideHandler) {
    document.removeEventListener('click', themeOutsideHandler);
    themeOutsideHandler = undefined;
  }
}

function closePaletteMenu(menu: HTMLElement) {
  paletteMenuOpen = false;
  menu.style.display = 'none';
  if (paletteOutsideHandler) {
    document.removeEventListener('click', paletteOutsideHandler);
    paletteOutsideHandler = undefined;
  }
}

function openThemeMenu(menu: HTMLElement, container: HTMLElement, paletteMenu: HTMLElement | null) {
  if (paletteMenu) {
    closePaletteMenu(paletteMenu);
  }
  themeMenuOpen = true;
  menu.style.display = 'block';
  const handler: (e: MouseEvent) => void = (e) => {
    if (!container.contains(e.target as Node)) {
      closeThemeMenu(menu);
    }
  };
  themeOutsideHandler = handler;
  setTimeout(() => document.addEventListener('click', handler), 0);
}

function openPaletteMenu(menu: HTMLElement, container: HTMLElement, themeMenu: HTMLElement | null) {
  if (themeMenu) {
    closeThemeMenu(themeMenu);
  }
  paletteMenuOpen = true;
  menu.style.display = 'block';
  const handler: (e: MouseEvent) => void = (e) => {
    if (!container.contains(e.target as Node)) {
      closePaletteMenu(menu);
    }
  };
  paletteOutsideHandler = handler;
  setTimeout(() => document.addEventListener('click', handler), 0);
}

function populateThemeMenu(menu: HTMLElement) {
  menu.textContent = '';
  const addItem = (id: string | null, label: string, selected: boolean) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ig-theme-item ig-nopan' + (selected ? ' ig-theme-item-selected' : '');
    b.textContent = label;
    b.dataset.themeId = id ?? '';
    menu.appendChild(b);
  };
  addItem(null, 'default', themeOverride === null);
  addItem('light', 'light', themeOverride === 'light');
  const reg = getThemes();
  for (const t of reg) {
    if (t === 'light') {
      continue;
    }
    addItem(t, themeDisplayName(t), themeOverride === t);
  }
}

function wireThemeControls(leftBar: HTMLElement) {
  const toggle = leftBar.querySelector('#ig-theme-toggle') as HTMLButtonElement | null;
  const container = leftBar.querySelector('.ig-theme-container') as HTMLElement | null;
  const menu = leftBar.querySelector('#ig-theme-menu') as HTMLElement | null;
  const paletteMenu = leftBar.querySelector('#ig-palette-menu') as HTMLElement | null;
  if (!toggle || !container || !menu) {
    return;
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    populateThemeMenu(menu);
    if (themeMenuOpen) {
      closeThemeMenu(menu);
    } else {
      openThemeMenu(menu, container, paletteMenu);
    }
  });

  menu.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('.ig-theme-item') as HTMLElement | null;
    if (!t?.dataset) {
      return;
    }
    e.stopPropagation();
    const id = t.dataset.themeId;
    themeOverride = id === '' || id === undefined ? null : id;
    closeThemeMenu(menu);
    if (!ig || !lastDsl) {
      return;
    }
    try {
      ig.render(lastDsl);
      applyEditorPreviewOverrides(ig);
      setPanMode(panEnabled);
      ensurePanzoom(false);
      updateZoomLabel();
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  });
}

function populatePaletteMenu(menu: HTMLElement) {
  menu.textContent = '';
  const addItem = (id: string | null, label: string, selected: boolean) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ig-theme-item ig-nopan' + (selected ? ' ig-theme-item-selected' : '');
    b.textContent = label;
    b.dataset.paletteId = id ?? '';
    menu.appendChild(b);
  };
  addItem(null, 'default', paletteOverride === null);
  let names = Object.keys(getPalettes()).sort();
  if (names.length === 0) {
    names = ['antv'];
  }
  for (const p of names) {
    addItem(p, p, paletteOverride === p);
  }
}

function wirePaletteControls(leftBar: HTMLElement) {
  const toggle = leftBar.querySelector('#ig-palette-toggle') as HTMLButtonElement | null;
  const container = leftBar.querySelector('.ig-palette-container') as HTMLElement | null;
  const menu = leftBar.querySelector('#ig-palette-menu') as HTMLElement | null;
  const themeMenu = leftBar.querySelector('#ig-theme-menu') as HTMLElement | null;
  if (!toggle || !container || !menu) {
    return;
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    populatePaletteMenu(menu);
    if (paletteMenuOpen) {
      closePaletteMenu(menu);
    } else {
      openPaletteMenu(menu, container, themeMenu);
    }
  });

  menu.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('.ig-theme-item') as HTMLElement | null;
    if (!t?.dataset) {
      return;
    }
    e.stopPropagation();
    const id = t.dataset.paletteId;
    paletteOverride = id === '' || id === undefined ? null : id;
    closePaletteMenu(menu);
    if (!ig || !lastDsl) {
      return;
    }
    try {
      ig.render(lastDsl);
      applyEditorPreviewOverrides(ig);
      setPanMode(panEnabled);
      ensurePanzoom(false);
      updateZoomLabel();
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  });
}

/** 当前侧栏预览实际使用的主题 id（含「跟随 DSL」解析） */
function effectivePreviewThemeId(): string | undefined {
  if (themeOverride === 'light') {
    return 'light';
  }
  if (themeOverride !== null) {
    return themeOverride;
  }
  return parseRootThemeFromDsl(lastDsl)?.theme;
}

function isDiagramDarkForExportModal(): boolean {
  const t = effectivePreviewThemeId();
  return t === 'dark' || (typeof t === 'string' && t.includes('dark'));
}

function syncExportModalThemeClass(modalContent: HTMLElement) {
  const vscodeDark =
    document.body.classList.contains('vscode-dark') ||
    document.body.getAttribute('data-vscode-theme-kind') === 'vscode-dark';
  const darkChrome = isDiagramDarkForExportModal() || vscodeDark;
  modalContent.classList.toggle('light', !darkChrome);
  modalContent.classList.toggle('dark', darkChrome);
}

/** 对齐 Mermaid Chart ExportModal + exportService 的导出面板 */
function wireExportModal(stage: HTMLElement) {
  const root = stage.querySelector('#ig-export-modal') as HTMLElement | null;
  const openBtn = stage.querySelector('#ig-export-open') as HTMLButtonElement | null;
  const backdrop = stage.querySelector('#ig-mc-modal-backdrop') as HTMLElement | null;
  const modalContent = stage.querySelector('#ig-mc-modal-content') as HTMLElement | null;
  const btnClose = stage.querySelector('#ig-mc-modal-close') as HTMLButtonElement | null;
  const cancel = stage.querySelector('#ig-mc-cancel') as HTMLButtonElement | null;
  const run = stage.querySelector('#ig-mc-export') as HTMLButtonElement | null;
  const copyBtn = stage.querySelector('#ig-mc-copy-btn') as HTMLButtonElement | null;
  const previewContainer = stage.querySelector('#ig-mc-preview-container') as HTMLElement | null;
  const previewContent = stage.querySelector('#ig-mc-preview-content') as HTMLElement | null;
  const colorInput = stage.querySelector('#ig-mc-custom-color') as HTMLInputElement | null;
  const colorHex = stage.querySelector('#ig-mc-color-hex') as HTMLElement | null;
  const customPicker = stage.querySelector('#ig-mc-custom-picker') as HTMLElement | null;
  const fmtInputs = stage.querySelectorAll<HTMLInputElement>('input[name="ig-mc-fmt"]');
  const bgSwatches = stage.querySelectorAll<HTMLElement>('.ig-mc-bg-swatch');

  if (
    !root ||
    !openBtn ||
    !backdrop ||
    !modalContent ||
    !btnClose ||
    !cancel ||
    !run ||
    !copyBtn ||
    !previewContainer ||
    !previewContent ||
    !colorInput ||
    !colorHex ||
    !customPicker
  ) {
    return;
  }

  let selectedFormat: 'png' | 'svg' = 'png';
  let selectedBg: 'light' | 'dark' | 'custom' | 'transparent' = 'light';
  let copySuccess = false;
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;
  let diagramObserver: MutationObserver | null = null;
  let escapeHandler: ((e: KeyboardEvent) => void) | undefined;

  const refreshCopyIcon = () => {
    copyBtn.innerHTML = copySuccess
      ? '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    copyBtn.title = copySuccess ? '已复制' : '复制到剪贴板';
  };

  const updateBgSwatchSelected = () => {
    bgSwatches.forEach((el) => {
      const v = el.dataset.bg as typeof selectedBg | undefined;
      el.classList.toggle('selected', v === selectedBg);
    });
  };

  const updateFormatSelected = () => {
    fmtInputs.forEach((inp) => {
      const label = inp.closest('.ig-mc-radio-option');
      label?.classList.toggle('selected', inp.value === selectedFormat);
      inp.checked = inp.value === selectedFormat;
    });
  };

  const updateExportPreview = () => {
    const isDiagramDark = isDiagramDarkForExportModal();
    const previewBg = getPreviewBackgroundColorMc(selectedBg, colorInput.value, isDiagramDark);
    previewContainer.classList.toggle('ig-mc-preview-transparent-bg', selectedBg === 'transparent');
    if (selectedBg === 'transparent') {
      previewContainer.style.backgroundColor = '';
    } else {
      previewContainer.style.backgroundColor = previewBg;
    }
    const main = getDiagramSvg();
    previewContent.textContent = '';
    if (!main) {
      const ph = document.createElement('div');
      ph.className = 'ig-mc-preview-placeholder';
      ph.textContent = `无可用图表\n背景: ${selectedBg} | 格式: ${selectedFormat.toUpperCase()}`;
      previewContent.appendChild(ph);
      return;
    }
    const cloned = main.cloneNode(true) as SVGSVGElement;
    uniquifyCloneIds(cloned);
    cloned.style.removeProperty('max-width');
    cloned.style.removeProperty('max-height');
    cloned.style.width = '100%';
    cloned.style.height = '100%';
    cloned.style.display = 'block';
    cloned.style.backgroundColor =
      previewBg === 'transparent' ? 'transparent' : previewBg;
    previewContent.appendChild(cloned);
  };

  const closeModal = () => {
    root.style.display = 'none';
    copySuccess = false;
    refreshCopyIcon();
    if (copyTimeout) {
      clearTimeout(copyTimeout);
      copyTimeout = undefined;
    }
    diagramObserver?.disconnect();
    diagramObserver = null;
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler);
      escapeHandler = undefined;
    }
  };

  const openModal = () => {
    const vscodeDark =
      document.body.classList.contains('vscode-dark') ||
      document.body.getAttribute('data-vscode-theme-kind') === 'vscode-dark';
    selectedFormat = 'png';
    selectedBg = vscodeDark ? 'dark' : 'light';
    colorInput.value = '#ffffff';
    colorHex.textContent = colorInput.value.toUpperCase();
    customPicker.style.display = 'none';
    updateFormatSelected();
    updateBgSwatchSelected();
    syncExportModalThemeClass(modalContent);
    root.style.display = 'flex';
    setTimeout(() => updateExportPreview(), 80);

    const diagramHost = document.getElementById('ig-diagram');
    diagramObserver?.disconnect();
    diagramObserver = null;
    if (diagramHost) {
      diagramObserver = new MutationObserver(() => {
        if (root.style.display === 'flex') {
          updateExportPreview();
        }
      });
      diagramObserver.observe(diagramHost, { childList: true, subtree: true });
    }

    escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', escapeHandler);
  };

  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal();
  });

  btnClose.addEventListener('click', () => closeModal());
  cancel.addEventListener('click', () => closeModal());

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal();
    }
  });

  fmtInputs.forEach((inp) => {
    inp.addEventListener('change', () => {
      if (inp.checked) {
        selectedFormat = inp.value as 'png' | 'svg';
        updateFormatSelected();
        updateExportPreview();
      }
    });
  });

  bgSwatches.forEach((sw) => {
    sw.addEventListener('click', (e) => {
      e.preventDefault();
      const v = sw.dataset.bg as typeof selectedBg | undefined;
      if (!v) {
        return;
      }
      if (v === 'custom') {
        selectedBg = 'custom';
        updateBgSwatchSelected();
        customPicker.style.display = 'flex';
        colorInput.click();
        updateExportPreview();
        return;
      }
      selectedBg = v;
      updateBgSwatchSelected();
      customPicker.style.display = 'none';
      updateExportPreview();
    });
  });

  colorInput.addEventListener('input', () => {
    selectedBg = 'custom';
    updateBgSwatchSelected();
    customPicker.style.display = 'flex';
    colorHex.textContent = colorInput.value.toUpperCase();
    updateExportPreview();
  });

  colorInput.addEventListener('change', () => {
    selectedBg = 'custom';
    updateBgSwatchSelected();
    customPicker.style.display = 'flex';
    colorHex.textContent = colorInput.value.toUpperCase();
    updateExportPreview();
  });

  run.addEventListener('click', () => {
    const exportBg = getExportBackgroundColorMc(selectedBg, colorInput.value);
    const fmt = selectedFormat;
    closeModal();
    void (async () => {
      try {
        const svg = getDiagramSvg();
        if (fmt === 'png') {
          const b64 = await exportPngWithInfographicFallback(
            ig,
            svg,
            exportBg,
            decodeSvgFromDataUrl,
            rasterizeSvgTextToPngBase64
          );
          vscode.postMessage({ type: 'exportPng', pngBase64: b64 });
        } else {
          const text = await exportSvgWithInfographicFallback(
            ig,
            svg,
            exportBg,
            injectSvgBackground,
            decodeSvgFromDataUrl
          );
          vscode.postMessage({ type: 'exportSvg', svgText: text });
        }
      } catch (err) {
        vscode.postMessage({
          type: 'error',
          message: `导出失败：${err instanceof Error ? err.message : String(err)}`,
        });
      }
    })();
  });

  copyBtn.addEventListener('click', () => {
    void (async () => {
      try {
        if (selectedFormat === 'png') {
          const svg = getDiagramSvg();
          if (!svg) {
            return;
          }
          await waitForFontsReady();
          const exportBg = getExportBackgroundColorMc(selectedBg, colorInput.value);
          const rect = svg.getBoundingClientRect();
          const w = Math.max(Math.round(rect.width), 1);
          const h = Math.max(Math.round(rect.height), 1);
          const scale = 2;
          const width = w * scale;
          const height = h * scale;
          const bgForCopy = selectedBg === 'transparent' ? 'transparent' : exportBg;
          const base64 = await getBase64SVGAsync(svg, width, height);
          const dataUrl = `data:image/svg+xml;base64,${base64}`;
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('SVG 解码失败'));
            img.src = dataUrl;
          });
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return;
          }
          if (bgForCopy !== 'transparent') {
            ctx.fillStyle = bgForCopy;
            ctx.fillRect(0, 0, width, height);
          }
          ctx.drawImage(img, 0, 0, width, height);
          const blob = await new Promise<Blob | null>((res) =>
            canvas.toBlob(res, 'image/png')
          );
          if (!blob) {
            return;
          }
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        } else {
          const inner = previewContent.querySelector('svg');
          if (!inner) {
            return;
          }
          const str = new XMLSerializer().serializeToString(inner);
          await navigator.clipboard.writeText(str);
        }
        copySuccess = true;
        refreshCopyIcon();
        if (copyTimeout) {
          clearTimeout(copyTimeout);
        }
        copyTimeout = setTimeout(() => {
          copySuccess = false;
          refreshCopyIcon();
        }, 2000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('not supported') ||
          msg.includes('Clipboard') ||
          msg.includes('Permission')
        ) {
          vscode.postMessage({
            type: 'showWarning',
            message:
              '当前环境无法将图片复制到剪贴板，请使用「导出」保存文件。（与 Mermaid Chart 行为一致）',
          });
        } else {
          vscode.postMessage({ type: 'error', message: `复制失败：${msg}` });
        }
      }
    })();
  });

  refreshCopyIcon();
}

function ensureShell(root: HTMLElement) {
  if (root.dataset.igShell === '1') {
    return;
  }
  root.textContent = '';
  applyMermaidLikeChromeColors();

  const stage = document.createElement('div');
  stage.className = 'ig-stage';

  const viewport = document.createElement('div');
  viewport.id = 'ig-viewport';
  viewport.className = 'ig-viewport';

  const panWrap = document.createElement('div');
  panWrap.id = 'ig-panzoom';
  panWrap.className = 'ig-panzoom';

  const host = document.createElement('div');
  host.id = 'ig-diagram';
  host.className = 'ig-host';

  panWrap.appendChild(host);
  viewport.appendChild(panWrap);
  stage.appendChild(viewport);

  // 左侧：主题 + 配色 + 分隔 + 下载（打开导出面板，对齐 Mermaid Chart LeftSideBar）
  const leftBar = document.createElement('div');
  leftBar.className = 'ig-left-bar ig-nopan';
  leftBar.innerHTML = `
    <div class="ig-theme-container ig-nopan">
      <button type="button" class="ig-mc-icon ig-nopan" id="ig-theme-toggle" title="Theme (@antv/infographic)">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5S18.33 12 17.5 12z"/></svg>
      </button>
      <div class="ig-theme-menu" id="ig-theme-menu" style="display:none" role="menu"></div>
    </div>
    <div class="ig-palette-container ig-nopan">
      <button type="button" class="ig-mc-icon ig-nopan" id="ig-palette-toggle" title="配色 Palette (getPalettes)">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor" />
        </svg>
      </button>
      <div class="ig-theme-menu" id="ig-palette-menu" style="display:none" role="menu"></div>
    </div>
    <div class="ig-toolbar-divider" aria-hidden="true"></div>
    <button type="button" class="ig-mc-icon ig-nopan" id="ig-export-open" title="导出为图片">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>
    </button>`;
  wireThemeControls(leftBar);
  wirePaletteControls(leftBar);

  // 右侧：手型平移 | 缩小 放大 适配 | Zoom N%（对齐 Mermaid Chart Sidebar）
  const rightBar = document.createElement('div');
  rightBar.className = 'ig-right-bar ig-nopan';

  const handSection = document.createElement('div');
  handSection.className = 'ig-hand-section ig-nopan';
  const panBtn = toolbarMcIcon(MC_TOOLBAR_HAND_SVG, '拖动画布（平移）；再次点击关闭');
  panBtn.id = 'ig-btn-pan';
  panBtn.addEventListener('click', () => setPanMode(!panEnabled));
  handSection.appendChild(panBtn);

  const zoomControls = document.createElement('div');
  zoomControls.className = 'ig-zoom-controls ig-nopan';

  const zout = toolbarMcIcon(MC_TOOLBAR_ZOOM_OUT_SVG, '缩小');
  zout.addEventListener('click', () => {
    panzoomInst?.zoomOut();
    updateZoomLabel();
  });

  const zin = toolbarMcIcon(MC_TOOLBAR_ZOOM_IN_SVG, '放大');
  zin.addEventListener('click', () => {
    panzoomInst?.zoomIn();
    updateZoomLabel();
  });

  const fitBtn = toolbarMcIcon(MC_TOOLBAR_FIT_SVG, '重置缩放并居中（适配）');
  fitBtn.addEventListener('click', () => {
    setPanMode(false);
    panzoomInst?.reset({ animate: false });
    updateZoomLabel();
  });

  zoomControls.append(zout, zin, fitBtn);

  const pct = document.createElement('div');
  pct.id = 'ig-zoom-pct';
  pct.className = 'ig-zoom-level ig-nopan';
  pct.textContent = 'Zoom 100%';
  zoomLabelEl = pct;

  rightBar.append(handSection, zoomControls, pct);

  const modal = document.createElement('div');
  modal.id = 'ig-export-modal';
  modal.className = 'ig-mc-modal-root ig-nopan';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="ig-mc-modal-backdrop" id="ig-mc-modal-backdrop">
      <div class="ig-mc-modal-content light" id="ig-mc-modal-content" role="dialog" aria-modal="true" aria-labelledby="ig-mc-modal-title">
        <div class="ig-mc-modal-header">
          <h2 class="ig-mc-modal-title" id="ig-mc-modal-title">Export diagram</h2>
          <button type="button" class="ig-mc-close-button ig-nopan" id="ig-mc-modal-close" title="关闭" aria-label="关闭">✕</button>
        </div>
        <div class="ig-mc-modal-body">
          <div class="ig-mc-export-options">
            <div class="ig-mc-option-group">
              <div class="ig-mc-option-group-title">Export format</div>
              <div class="ig-mc-format-options">
                <label class="ig-mc-radio-option selected ig-nopan">
                  <input type="radio" name="ig-mc-fmt" value="png" class="ig-mc-radio-input ig-nopan" checked />
                  <div class="ig-mc-radio-content">
                    <span class="ig-mc-radio-label">PNG</span>
                    <span class="ig-mc-radio-description">High quality raster image</span>
                  </div>
                </label>
                <label class="ig-mc-radio-option ig-nopan">
                  <input type="radio" name="ig-mc-fmt" value="svg" class="ig-mc-radio-input ig-nopan" />
                  <div class="ig-mc-radio-content">
                    <span class="ig-mc-radio-label">SVG</span>
                    <span class="ig-mc-radio-description">Scalable vector graphics</span>
                  </div>
                </label>
              </div>
            </div>
            <div class="ig-mc-option-group">
              <div class="ig-mc-option-group-title">Background color</div>
              <div class="ig-mc-background-color-options">
                <button type="button" class="ig-mc-color-option ig-mc-bg-swatch ig-mc-background-light selected ig-nopan" data-bg="light" title="Light background"></button>
                <button type="button" class="ig-mc-color-option ig-mc-bg-swatch ig-mc-background-dark ig-nopan" data-bg="dark" title="Dark background"></button>
                <button type="button" class="ig-mc-color-option ig-mc-bg-swatch ig-mc-background-transparent ig-nopan" data-bg="transparent" title="Transparent background"></button>
                <button type="button" class="ig-mc-color-option ig-mc-bg-swatch ig-mc-background-custom ig-nopan" data-bg="custom" title="Pick custom color"></button>
              </div>
              <div class="ig-mc-custom-color-picker" id="ig-mc-custom-picker" style="display:none">
                <div class="ig-mc-color-picker-container">
                  <label class="ig-mc-color-picker-label">
                    <input type="color" class="ig-mc-color-input ig-nopan" id="ig-mc-custom-color" value="#ffffff" />
                    <span class="ig-mc-color-picker-text">Custom</span>
                  </label>
                </div>
                <span class="ig-mc-color-value" id="ig-mc-color-hex">#FFFFFF</span>
              </div>
            </div>
          </div>
          <div class="ig-mc-preview-section">
            <div class="ig-mc-preview-title">Preview</div>
            <div class="ig-mc-preview-container" id="ig-mc-preview-container">
              <button type="button" class="ig-mc-copy-button ig-nopan" id="ig-mc-copy-btn" title="复制到剪贴板"></button>
              <div class="ig-mc-preview-content" id="ig-mc-preview-content"></div>
            </div>
          </div>
        </div>
        <div class="ig-mc-modal-footer">
          <button type="button" class="ig-mc-button ig-mc-button-secondary ig-nopan" id="ig-mc-cancel">Cancel</button>
          <button type="button" class="ig-mc-button ig-mc-button-primary ig-nopan" id="ig-mc-export">Export</button>
        </div>
      </div>
    </div>`;

  stage.appendChild(leftBar);
  stage.appendChild(rightBar);
  stage.appendChild(modal);
  wireExportModal(stage);

  root.appendChild(stage);
  root.dataset.igShell = '1';

  window.addEventListener('focus', applyMermaidLikeChromeColors);
}

function render(content: string, width: number | string, height: number | string, resetView: boolean) {
  if (!rootEl) {
    return;
  }
  ensureShell(rootEl);
  applyMermaidLikeChromeColors();
  const host = document.getElementById('ig-diagram');
  if (!host) {
    return;
  }
  clearError();
  destroyIg();
  host.innerHTML = '';
  const canvas = document.createElement('div');
  canvas.style.width = '100%';
  canvas.style.boxSizing = 'border-box';
  host.appendChild(canvas);

  const initialOptions = getInitialPreviewOptionsFromDsl(content);
  const next = new Infographic({
    container: canvas,
    width,
    height,
    editable: true,
    ...initialOptions,
  });
  ig = next;
  next.on('options:change', () => pushVisual());
  next.on('error', (payload: unknown) => {
    const msg =
      payload instanceof Error
        ? payload.message
        : typeof payload === 'string'
          ? payload
          : JSON.stringify(payload);
    showError(msg);
  });
  try {
    lastDsl = content.trimEnd() + '\n';
    lastW = width;
    lastH = height;
    next.render(content);
    lastRendered = lastDsl;
    setPanMode(false);
    ensurePanzoom(resetView);
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
  }
}

window.addEventListener('message', (event) => {
  const m = event.data as {
    type?: string;
    content?: string;
    width?: number | string;
    height?: number | string;
  };
  if (m.type !== 'update') {
    return;
  }
  const content = m.content ?? '';
  const normalized = content.trimEnd() + '\n';
  if (pendingEcho && normalized === pendingEcho) {
    pendingEcho = '';
    lastRendered = normalized;
    return;
  }
  const w = m.width ?? '100%';
  const h = m.height ?? 480;
  render(content, w, h, true);
});

vscode.postMessage({ type: 'ready' });
