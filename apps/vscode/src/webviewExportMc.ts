/**
 * 导出逻辑对齐 Mermaid Chart vscode-mermaid-chart：
 * - webview/src/services/exportService.ts（视口尺寸 × 倍数、Canvas 填底、SVG base64）
 * - webview/src/ExportModal.svelte（预览克隆 + uniquifyCloneIds）
 *
 * 另：SVG 作为 data: 图片栅格化时处于独立文档，父页 Web 字体不可用；
 * 与 Infographic.toDataURL 一致，序列化前对克隆调用 embedFonts 内联 woff2。
 */

import type { Infographic } from '@antv/infographic';
/* package.json exports 未开放子路径，esbuild 需直连磁盘文件 */
import { embedFonts } from '../node_modules/@antv/infographic/esm/exporter/font.js';
import { decodeFontFamily, encodeFontFamily, splitFontFamily } from '../node_modules/@antv/infographic/esm/utils/font.js';

export const IG_DIAGRAM_SELECTOR = '#ig-diagram svg';

/** 与 ExportModal.svelte 一致的 ID 前缀，避免预览克隆与主文档冲突 */
export function uniquifyCloneIds(clone: SVGElement): void {
  const prefix = 'export-preview-';
  const referencedIds = new Set<string>();
  const urlAttrNames = [
    'fill',
    'stroke',
    'clip-path',
    'mask',
    'filter',
    'marker-start',
    'marker-mid',
    'marker-end',
  ];

  clone.querySelectorAll('*').forEach((el) => {
    urlAttrNames.forEach((attr) => {
      const val = el.getAttribute(attr);
      if (val?.includes('url(#')) {
        const matches = val.match(/url\(#([^)]+)\)/g);
        matches?.forEach((match) => {
          const id = match.slice(5, -1);
          referencedIds.add(id);
        });
      }
    });
    const style = el.getAttribute('style');
    if (style?.includes('url(#')) {
      const matches = style.match(/url\(#([^)]+)\)/g);
      matches?.forEach((match) => {
        referencedIds.add(match.slice(5, -1));
      });
    }
    ['href', 'xlink:href'].forEach((attr) => {
      const val =
        el.getAttribute(attr) || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (val?.startsWith('#')) {
        referencedIds.add(val.slice(1));
      }
    });
  });

  const idMap = new Map<string, string>();
  referencedIds.forEach((id) => {
    const newId = prefix + id;
    idMap.set(id, newId);
    const element = clone.querySelector(`[id="${id}"]`);
    if (element) {
      element.setAttribute('id', newId);
    }
  });

  clone.querySelectorAll('*').forEach((el) => {
    urlAttrNames.forEach((attr) => {
      const val = el.getAttribute(attr);
      if (val?.includes('url(#')) {
        let newVal = val;
        idMap.forEach((newId, oldId) => {
          newVal = newVal.replace(new RegExp(`url\\(#${oldId}\\)`, 'g'), `url(#${newId})`);
        });
        el.setAttribute(attr, newVal);
      }
    });
    const style = el.getAttribute('style');
    if (style?.includes('url(#')) {
      let newStyle = style;
      idMap.forEach((newId, oldId) => {
        newStyle = newStyle.replace(new RegExp(`url\\(#${oldId}\\)`, 'g'), `url(#${newId})`);
      });
      el.setAttribute('style', newStyle);
    }
    ['href', 'xlink:href'].forEach((attr) => {
      const val =
        el.getAttribute(attr) || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (val?.startsWith('#')) {
        const oldId = val.slice(1);
        const newId = idMap.get(oldId);
        if (newId) {
          el.setAttribute(attr === 'xlink:href' ? 'xlink:href' : 'href', '#' + newId);
        }
      }
    });
  });
}

export function getDiagramSvg(): SVGSVGElement | null {
  const el = document.querySelector(IG_DIAGRAM_SELECTOR);
  return el instanceof SVGSVGElement ? el : null;
}

export function svgStringToBase64Utf8(svgString: string): string {
  return btoa(unescape(encodeURIComponent(svgString)));
}

function appendCloneStyle(target: Element, snippet: string): void {
  const prev = target.getAttribute('style');
  target.setAttribute('style', prev ? `${prev}; ${snippet}` : snippet);
}

const GENERIC_FONT_FAMILIES_LC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  '-apple-system',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

function isSkippableGenericFont(name: string): boolean {
  return GENERIC_FONT_FAMILIES_LC.has(name.trim().toLowerCase());
}

function fontFamilyFromStyleAttr(el: Element): string | null {
  const st = el.getAttribute('style');
  if (!st) {
    return null;
  }
  const m = st.match(/font-family\s*:\s*([^;]+)/i);
  return m ? m[1]!.trim() : null;
}

/**
 * @antv/infographic 的 embedFonts 只收集根 svg[font-family] 与 foreignObject span；
 * 主题写在 text/tspan 上的字族不会触发 woff2 内联，这里汇总后插入隐藏探测用 foreignObject。
 */
function collectDecodedNonGenericFontFamilies(clone: SVGSVGElement): Set<string> {
  const out = new Set<string>();
  const ingestRaw = (raw: string | null | undefined) => {
    if (!raw?.trim()) {
      return;
    }
    splitFontFamily(raw).forEach((piece) => {
      const d = decodeFontFamily(piece);
      if (d && !isSkippableGenericFont(d)) {
        out.add(d);
      }
    });
  };
  ingestRaw(clone.getAttribute('font-family'));
  clone.querySelectorAll('text, tspan').forEach((el) => {
    ingestRaw(el.getAttribute('font-family'));
    ingestRaw(fontFamilyFromStyleAttr(el));
  });
  clone.querySelectorAll('foreignObject span').forEach((span) => {
    if (!(span instanceof HTMLElement)) {
      return;
    }
    ingestRaw(span.style.fontFamily);
    ingestRaw(fontFamilyFromStyleAttr(span));
  });
  return out;
}

function appendHiddenFontProbesForEmbed(clone: SVGSVGElement, families: Set<string>): void {
  if (families.size === 0) {
    return;
  }
  const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  fo.setAttribute('width', '0');
  fo.setAttribute('height', '0');
  fo.setAttribute('x', '-10000');
  fo.setAttribute('y', '-10000');
  fo.setAttribute('overflow', 'hidden');
  for (const fam of families) {
    const span = document.createElement('span');
    span.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    span.style.setProperty('font-family', encodeFontFamily(fam));
    span.textContent = '\u00a0';
    fo.appendChild(span);
  }
  clone.appendChild(fo);
}

async function embedWebFontsIntoExportClone(clone: SVGSVGElement): Promise<void> {
  const families = collectDecodedNonGenericFontFamilies(clone);
  appendHiddenFontProbesForEmbed(clone, families);
  try {
    await embedFonts(clone, true);
  } catch {
    /* fetch/postcss 失败时仍允许导出 */
  }
}

function applyRasterDimensions(clone: SVGSVGElement, width: number, height: number): void {
  clone.setAttribute('width', `${width}px`);
  clone.setAttribute('height', `${height}px`);
  clone.style.removeProperty('max-width');
  clone.style.removeProperty('max-height');
}

/**
 * 视口里的 SVG 依赖 body 等外部 CSS（如 VS Code 的 font-family）；
 * 序列化为 data: URL 后脱离文档，栅格化会退回默认字体。
 * 将源节点上已计算的字体与文本颜色写入克隆，使导出 PNG / 独立 SVG 与屏幕一致。
 *
 * @antv/infographic 中多数文案通过 foreignObject > span（HTML）排版，而非 SVG <text>；
 * 仅处理 text/tspan 无法覆盖主题默认继承字体，故必须同步内联 foreignObject 内 span。
 */
function inlineComputedSvgTypography(source: SVGSVGElement, clone: SVGSVGElement): void {
  const origNodes = source.querySelectorAll('text, tspan');
  const cloneNodes = clone.querySelectorAll('text, tspan');
  const len = Math.min(origNodes.length, cloneNodes.length);
  for (let i = 0; i < len; i++) {
    const cs = getComputedStyle(origNodes[i]!);
    const parts: string[] = [];
    if (cs.fontFamily) {
      parts.push(`font-family: ${cs.fontFamily}`);
    }
    if (cs.fontSize) {
      parts.push(`font-size: ${cs.fontSize}`);
    }
    if (cs.fontWeight) {
      parts.push(`font-weight: ${cs.fontWeight}`);
    }
    if (cs.fontStyle) {
      parts.push(`font-style: ${cs.fontStyle}`);
    }
    const fill = cs.fill;
    if (fill && fill !== 'none') {
      parts.push(`fill: ${fill}`);
    }
    const stroke = cs.stroke;
    if (stroke && stroke !== 'none') {
      parts.push(`stroke: ${stroke}`);
      if (cs.strokeWidth) {
        parts.push(`stroke-width: ${cs.strokeWidth}`);
      }
    }
    if (parts.length > 0) {
      appendCloneStyle(cloneNodes[i]!, parts.join('; '));
    }
  }

  const origSpans = source.querySelectorAll('foreignObject span');
  const cloneSpans = clone.querySelectorAll('foreignObject span');
  const spanLen = Math.min(origSpans.length, cloneSpans.length);
  for (let i = 0; i < spanLen; i++) {
    const cs = getComputedStyle(origSpans[i]!);
    const parts: string[] = [];
    if (cs.fontFamily) {
      parts.push(`font-family: ${cs.fontFamily}`);
    }
    if (cs.fontSize) {
      parts.push(`font-size: ${cs.fontSize}`);
    }
    if (cs.fontWeight) {
      parts.push(`font-weight: ${cs.fontWeight}`);
    }
    if (cs.fontStyle) {
      parts.push(`font-style: ${cs.fontStyle}`);
    }
    if (cs.color) {
      parts.push(`color: ${cs.color}`);
    }
    if (cs.letterSpacing && cs.letterSpacing !== 'normal') {
      parts.push(`letter-spacing: ${cs.letterSpacing}`);
    }
    if (cs.lineHeight) {
      parts.push(`line-height: ${cs.lineHeight}`);
    }
    if (parts.length > 0) {
      appendCloneStyle(cloneSpans[i]!, parts.join('; '));
    }
  }

  const rootStyleAttr = clone.getAttribute('style') || '';
  const svgCs = getComputedStyle(source);
  if (svgCs.fontFamily && !/\bfont-family\s*:/i.test(rootStyleAttr)) {
    const ff = `font-family: ${svgCs.fontFamily}`;
    clone.setAttribute('style', rootStyleAttr ? `${rootStyleAttr}; ${ff}` : ff);
  }
}

/** 确保主题/远程字体已加载后再序列化，避免 computed 与栅格化瞬间不一致 */
export async function waitForFontsReady(): Promise<void> {
  try {
    await document.fonts?.ready;
  } catch {
    /* ignore */
  }
}

export async function serializeSvgForRasterAsync(
  svg: SVGSVGElement,
  width: number,
  height: number
): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  uniquifyCloneIds(clone);
  inlineComputedSvgTypography(svg, clone);
  await embedWebFontsIntoExportClone(clone);
  applyRasterDimensions(clone, width, height);
  return new XMLSerializer().serializeToString(clone);
}

/** 按目标画布像素序列化；含 woff2 内联，供 data: 栅格化 */
export async function getBase64SVGAsync(
  svg: SVGSVGElement,
  width: number,
  height: number
): Promise<string> {
  return svgStringToBase64Utf8(await serializeSvgForRasterAsync(svg, width, height));
}

function isLightColor(hexColor: string): boolean {
  const hex = hexColor.replace('#', '');
  if (hex.length < 6) {
    return true;
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

/** 与 exportService.exportSvg 一致：背景色 + 浅色时 color:#000；含字体嵌入 */
export async function buildSvgExportStringAsync(
  svg: SVGSVGElement,
  backgroundColor: string | 'transparent'
): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  uniquifyCloneIds(clone);
  inlineComputedSvgTypography(svg, clone);
  await embedWebFontsIntoExportClone(clone);
  if (backgroundColor !== 'transparent') {
    clone.style.backgroundColor = backgroundColor;
    if (isLightColor(backgroundColor)) {
      clone.style.color = '#000000';
    }
  }
  return new XMLSerializer().serializeToString(clone);
}

/** 与 ExportModal getExportBackgroundColor / getPreviewBackgroundColor 一致 */
export function getExportBackgroundColorMc(
  selected: string,
  customHex: string
): string | 'transparent' {
  switch (selected) {
    case 'light':
      return '#ffffff';
    case 'dark':
      return '#171719';
    case 'custom':
      return customHex || '#ffffff';
    case 'transparent':
    default:
      return 'transparent';
  }
}

export function getPreviewBackgroundColorMc(
  selected: string,
  customHex: string,
  isDiagramDark: boolean
): string {
  switch (selected) {
    case 'light':
      return '#ffffff';
    case 'dark':
      return isDiagramDark ? '#1f1f1f' : '#171719';
    case 'custom':
      return customHex || '#ffffff';
    case 'transparent':
    default:
      return 'transparent';
  }
}

/** 与 exportService.exportPng：box × multiplier + 填底 + drawImage */
export async function exportPngFromViewportSvg(
  svg: SVGSVGElement,
  backgroundColor: string | 'transparent'
): Promise<string> {
  await waitForFontsReady();
  const box = svg.getBoundingClientRect();
  const multiplier = 2;
  const canvasW = Math.max(Math.round(box.width * multiplier), 1);
  const canvasH = Math.max(Math.round(box.height * multiplier), 1);

  const base64 = await getBase64SVGAsync(svg, canvasW, canvasH);
  const dataUrl = `data:image/svg+xml;base64,${base64}`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('无法将 SVG 加载为图片'));
    image.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('无法创建 Canvas 上下文');
  }
  if (backgroundColor !== 'transparent') {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvasW, canvasH);
  }
  context.drawImage(image, 0, 0, canvasW, canvasH);
  return canvas.toDataURL('image/png').split(',')[1]!;
}

export type DecodeSvgFromDataUrl = (dataUrl: string) => string;

export type RasterizeSvgText = (
  svgText: string,
  opts?: { dpr?: number; background?: string | 'transparent' }
) => Promise<string>;

/** 视口导出失败时回退 AntV toDataURL + 栅格化 */
export async function exportPngWithInfographicFallback(
  ig: Infographic | undefined,
  svg: SVGSVGElement | null,
  exportBgResolved: string | 'transparent',
  decodeSvgFromDataUrl: DecodeSvgFromDataUrl,
  rasterizeSvgTextToPngBase64: RasterizeSvgText
): Promise<string> {
  if (svg) {
    try {
      return await exportPngFromViewportSvg(svg, exportBgResolved);
    } catch {
      /* fall through */
    }
  }
  if (!ig) {
    throw new Error('当前没有可导出的画布');
  }
  await waitForFontsReady();
  const transparent = exportBgResolved === 'transparent';
  try {
    const dataUrl = await ig.toDataURL({
      type: 'png',
      removeBackground: transparent,
    });
    return dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
  } catch {
    /* continue */
  }
  const svgUrl = await ig.toDataURL({
    type: 'svg',
    embedResources: true,
    removeBackground: transparent,
  });
  const svgText = decodeSvgFromDataUrl(svgUrl);
  return rasterizeSvgTextToPngBase64(svgText, {
    background: transparent ? 'transparent' : exportBgResolved,
  });
}

export async function exportSvgWithInfographicFallback(
  ig: Infographic | undefined,
  svg: SVGSVGElement | null,
  exportBgResolved: string | 'transparent',
  injectSvgBackground: (svgText: string, fill: string) => string,
  decodeSvgFromDataUrl: DecodeSvgFromDataUrl
): Promise<string> {
  if (svg) {
    try {
      await waitForFontsReady();
      return buildSvgExportStringAsync(svg, exportBgResolved);
    } catch {
      /* fall through */
    }
  }
  if (!ig) {
    throw new Error('当前没有可导出的画布');
  }
  const dataUrl = await ig.toDataURL({
    type: 'svg',
    embedResources: true,
    removeBackground: exportBgResolved === 'transparent',
  });
  let svgText = decodeSvgFromDataUrl(dataUrl);
  if (exportBgResolved !== 'transparent') {
    svgText = injectSvgBackground(svgText, exportBgResolved);
  }
  return svgText;
}
