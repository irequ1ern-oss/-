// Проверка контраста цветов из tokens.css по WCAG AA (4.5:1 для обычного текста).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Переменные темы: общие (:root) + блок [data-theme='…']. */
function themeVars(theme: 'light' | 'dark' | 'amoled'): Record<string, string> {
  const vars: Record<string, string> = {};
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [, selector, body] of blocks) {
    const sel = selector.trim();
    const applies = sel === ':root' || sel.includes(`[data-theme='${theme}']`) || (theme === 'light' && sel.startsWith(':root,'));
    if (!applies || sel.startsWith('@')) continue;
    for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[name] = value.trim();
  }
  return vars;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Цвет fg с прозрачностью alpha поверх bg (как color-mix(in srgb, fg alpha%, bg)). */
function mix(fg: string, bg: string, alpha: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const out = [1, 3, 5].map((i) => Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha)));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const TEXT_PAIRS: [string, string][] = [
  ['label', 'bg'], ['label', 'surface'], ['label', 'surface-2'],
  ['label-2', 'bg'], ['label-2', 'surface'],
  ['accent', 'bg'], ['accent', 'surface'],
  ['on-accent', 'accent-fill'],
  ['danger', 'surface'], ['success', 'surface'], ['warning', 'surface'],
];
const WHITE_ON = ['danger-fill', 'success-fill', 'warning-fill', 'info-fill'];

describe.each(['light', 'dark', 'amoled'] as const)('тема %s', (theme) => {
  const v = themeVars(theme);

  it.each(TEXT_PAIRS)('%s на %s ≥ 4.5', (fg, bg) => {
    expect(v[fg], fg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(v[bg], bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(v[fg], v[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(WHITE_ON)('белый текст на %s ≥ 4.5', (bg) => {
    expect(contrast('#ffffff', v[bg])).toBeGreaterThanOrEqual(4.5);
  });

  // Метки «замена», «отменена» и плашка изменений: цветной текст на своём же бледном оттенке.
  it.each([
    ['warning', 0.16, 'surface'], ['warning', 0.16, 'bg'],
    ['danger', 0.14, 'surface'], ['danger', 0.14, 'bg'],
  ] as const)('%s на своём оттенке %s поверх %s ≥ 4.5', (fg, alpha, bg) => {
    expect(contrast(v[fg], mix(v[fg], v[bg], alpha))).toBeGreaterThanOrEqual(4.5);
  });

  it('все 13 цветов предметов заданы', () => {
    for (const c of ['blue', 'indigo', 'purple', 'teal', 'cyan', 'mint', 'green', 'yellow', 'orange', 'brown', 'gray', 'red', 'pink']) {
      expect(v[`sc-${c}`], c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('тёмные темы отличаются от светлой', () => {
  it('AMOLED — чисто чёрный фон', () => {
    expect(themeVars('amoled').bg).toBe('#000000');
    expect(themeVars('dark').bg).not.toBe('#000000');
  });
});

describe('index.html', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  it.each(['light', 'dark', 'amoled'] as const)('цвет строки состояния до загрузки = --bg темы %s', (theme) => {
    const m = html.match(new RegExp(`${theme}: '(#[0-9a-f]{6})'`, 'i'));
    expect(m?.[1].toLowerCase()).toBe(themeVars(theme).bg.toLowerCase());
  });
});
