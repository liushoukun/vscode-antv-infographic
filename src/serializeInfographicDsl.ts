/**
 * 将 Infographic#getOptions() 的纯数据字段序列化为 AntV Infographic 缩进 DSL（尽力而为，供可视化编辑写回）。
 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** 避免把运行时合并后的整棵 theme（base/item/…）写进 md，只保留常见可编辑项 */
function pickSerializableThemeConfig(tc: Record<string, unknown>): Record<string, unknown> {
  const keys = ['palette', 'colorPrimary', 'colorBg', 'stylize'] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in tc && tc[k] !== undefined && tc[k] !== null) {
      out[k] = tc[k];
    }
  }
  return out;
}

function serializeValue(val: unknown): string {
  if (typeof val === 'string') {
    return val;
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  return String(val);
}

/** 数组项：`-` 行后接缩进的键值（与解析器期望的结构一致） */
function serializeArrayItems(lines: string[], items: unknown[], itemBaseIndent: number): void {
  const dashPad = ' '.repeat(itemBaseIndent);
  const keyPad = ' '.repeat(itemBaseIndent + 2);
  for (const item of items) {
    if (isPlainObject(item)) {
      const entries = Object.entries(item).filter(([, v]) => v !== undefined);
      if (entries.length === 0) {
        lines.push(`${dashPad}-`);
        continue;
      }
      const [firstKey, firstVal] = entries[0];
      if (
        entries.length === 1 &&
        (typeof firstVal === 'string' ||
          typeof firstVal === 'number' ||
          typeof firstVal === 'boolean')
      ) {
        lines.push(`${dashPad}- ${firstKey} ${serializeValue(firstVal)}`);
        for (let i = 1; i < entries.length; i++) {
          const [k, v] = entries[i];
          lines.push(`${keyPad}${k} ${serializeValue(v)}`);
        }
        continue;
      }
      lines.push(`${dashPad}-`);
      serializeEntries(lines, item, itemBaseIndent + 2);
    } else {
      lines.push(`${dashPad}- ${serializeValue(item)}`);
    }
  }
}

function serializeEntries(lines: string[], obj: Record<string, unknown>, baseIndent: number): void {
  const pad = ' '.repeat(baseIndent);
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) {
      continue;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) {
        continue;
      }
      lines.push(`${pad}${key}`);
      serializeArrayItems(lines, val, baseIndent + 2);
    } else if (isPlainObject(val)) {
      if (Object.keys(val).length === 0) {
        continue;
      }
      lines.push(`${pad}${key}`);
      serializeEntries(lines, val, baseIndent + 2);
    } else {
      lines.push(`${pad}${key} ${serializeValue(val)}`);
    }
  }
}

export function serializeInfographicDsl(raw: Record<string, unknown>): string {
  const lines: string[] = [];
  const template = raw.template;
  if (typeof template === 'string' && template.trim()) {
    lines.push(`infographic ${template.trim()}`);
  } else {
    lines.push('infographic');
  }

  if (isPlainObject(raw.design) && Object.keys(raw.design).length > 0) {
    lines.push('design');
    serializeEntries(lines, raw.design, 2);
  }

  if (isPlainObject(raw.data) && Object.keys(raw.data).length > 0) {
    lines.push('data');
    serializeEntries(lines, raw.data, 2);
  }

  const themeName = typeof raw.theme === 'string' ? raw.theme.trim() : '';
  const tc =
    raw.themeConfig && isPlainObject(raw.themeConfig)
      ? pickSerializableThemeConfig(raw.themeConfig as Record<string, unknown>)
      : undefined;
  if (tc && 'type' in tc) {
    delete tc.type;
  }
  const restKeys = tc
    ? Object.keys(tc).filter((k) => tc[k] !== undefined && tc[k] !== null)
    : [];

  if (themeName && restKeys.length === 0) {
    lines.push(`theme ${themeName}`);
  } else if (themeName && restKeys.length > 0 && tc) {
    lines.push('theme');
    lines.push(`  type ${themeName}`);
    serializeEntries(lines, tc, 2);
  } else if (!themeName && tc && restKeys.length > 0) {
    lines.push('theme');
    serializeEntries(lines, tc, 2);
  }

  if (raw.width !== undefined) {
    lines.push(`width ${serializeValue(raw.width)}`);
  }
  if (raw.height !== undefined) {
    lines.push(`height ${serializeValue(raw.height)}`);
  }

  return lines.join('\n').trimEnd() + '\n';
}
