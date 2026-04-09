import { Infographic } from '@antv/infographic';

const ATTR = 'data-vscode-infographic';
const HOST_SELECTOR = `.vscode-infographic-host[${ATTR}="1"]`;
const DEBOUNCE_MS = 120;
const TEMPLATE_CLASS = 'vscode-infographic-src';

const instances = new WeakMap<HTMLElement, Infographic>();

function getSource(host: HTMLElement): string {
  const code = host.querySelector('code.language-infographic');
  if (code) {
    return code.textContent ?? '';
  }
  const tmpl = host.querySelector(`template.${TEMPLATE_CLASS}`);
  return tmpl?.textContent ?? '';
}

function shouldSkip(host: HTMLElement, source: string): boolean {
  if (!host.querySelector('.vscode-infographic-canvas')) {
    return false;
  }
  const tmpl = host.querySelector(`template.${TEMPLATE_CLASS}`);
  return tmpl !== null && tmpl.textContent === source;
}

function showError(container: HTMLElement, message: string): void {
  container.innerHTML = '';
  const pre = document.createElement('pre');
  pre.className = 'vscode-infographic-error';
  pre.textContent = message;
  container.appendChild(pre);
}

function ensureHostsFromCodeBlocks(): void {
  const blocks = document.querySelectorAll<HTMLElement>('pre > code.language-infographic');
  blocks.forEach((code) => {
    const pre = code.parentElement;
    if (!pre) {
      return;
    }

    const existing = pre.parentElement;
    if (existing?.matches?.(HOST_SELECTOR)) {
      return;
    }

    const host = document.createElement('div');
    host.className = 'vscode-infographic-host';
    host.setAttribute(ATTR, '1');
    pre.parentElement?.insertBefore(host, pre);
    host.appendChild(pre);
  });
}

function renderHost(host: HTMLElement): void {
  const source = getSource(host).trim();
  if (!source) {
    return;
  }

  if (shouldSkip(host, source)) {
    return;
  }

  const prev = instances.get(host);
  if (prev) {
    try {
      prev.destroy();
    } catch {
      // ignore destroy errors, keep rendering path alive
    }
    instances.delete(host);
  }

  host.innerHTML = '';
  const tpl = document.createElement('template');
  tpl.className = TEMPLATE_CLASS;
  tpl.textContent = source;
  host.appendChild(tpl);

  const root = document.createElement('div');
  root.className = 'vscode-infographic-canvas';
  host.appendChild(root);

  try {
    const ig = new Infographic({
      container: root,
      width: '100%',
      height: 400,
      editable: false,
    });
    ig.render(source);
    instances.set(host, ig);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showError(root, `Infographic 渲染失败：${msg}`);
  }
}

function scan(): void {
  ensureHostsFromCodeBlocks();
  document.querySelectorAll<HTMLElement>(HOST_SELECTOR).forEach(renderHost);
}

let scheduled: ReturnType<typeof setTimeout> | undefined;

function scheduleScan(): void {
  if (scheduled) {
    clearTimeout(scheduled);
  }
  scheduled = setTimeout(() => {
    scheduled = undefined;
    scan();
  }, DEBOUNCE_MS);
}

const observer = new MutationObserver(() => scheduleScan());

function start(): void {
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  scheduleScan();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
