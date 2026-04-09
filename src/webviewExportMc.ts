/**
 * 导出逻辑对齐 Mermaid Chart vscode-mermaid-chart：
 * - webview/src/services/exportService.ts（视口尺寸 × 倍数、Canvas 填底、SVG base64）
 * - webview/src/ExportModal.svelte（预览克隆 + uniquifyCloneIds）
 */

import type { Infographic } from '@antv/infographic';

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

export function serializeSvgForRaster(
  svg: SVGSVGElement,
  width: number,
  height: number
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  uniquifyCloneIds(clone);
  clone.setAttribute('width', `${width}px`);
  clone.setAttribute('height', `${height}px`);
  clone.style.removeProperty('max-width');
  clone.style.removeProperty('max-height');
  return new XMLSerializer().serializeToString(clone);
}

/** 与 exportService.getBase64SVG 一致：按目标画布像素序列化 */
export function getBase64SVG(svg: SVGSVGElement, width: number, height: number): string {
  return svgStringToBase64Utf8(serializeSvgForRaster(svg, width, height));
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

/** 与 exportService.exportSvg 一致：背景色 + 浅色时 color:#000 */
export function buildSvgExportString(
  svg: SVGSVGElement,
  backgroundColor: string | 'transparent'
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  uniquifyCloneIds(clone);
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
  const box = svg.getBoundingClientRect();
  const multiplier = 2;
  const canvasW = Math.max(Math.round(box.width * multiplier), 1);
  const canvasH = Math.max(Math.round(box.height * multiplier), 1);

  const base64 = getBase64SVG(svg, canvasW, canvasH);
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
      return buildSvgExportString(svg, exportBgResolved);
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
