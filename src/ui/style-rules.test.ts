// Правила дизайн-системы: цвета, тени и размеры текста задаются только в tokens.css.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../', import.meta.url).pathname;
const DIRS = ['ui', 'shell', 'views', 'preview'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(css|tsx)$/.test(name) && name !== 'tokens.css' ? [p] : [];
  });
}

const COLOR = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b|\brgba?\(|\bhsla?\(/;

/** Строки файла (с номерами), в которых нашлось нарушение. */
function violations(file: string, isBad: (line: string) => boolean): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => isBad(line.replace(/\/\/.*$/, '')))
    .map(([n, l]) => `${n}: ${l.trim()}`);
}

/**
 * Размер шрифта «вручную»: font-size (в CSS и в style="…") или font-size в шорткате font
 * с числом в px/rem/em. Можно: var(--fs-…), inherit, проценты, calc(…) с var(…).
 */
const FONT_DECL = /(?:^|[\s;{"'`])(?:font-size|font)\s*:\s*([^;"'`}]+)/g;
const RAW_LENGTH = /\d(?:px|rem|em)\b/;

function hasRawFontSize(line: string): boolean {
  for (const [, value] of line.matchAll(FONT_DECL)) {
    // calc(…) с токеном внутри — можно; сами var(…) тоже не считаем.
    const rest = value
      .replace(/calc\((?:[^()]|\([^()]*\))*\)/g, (m) => (m.includes('var(') ? '' : m))
      .replace(/var\([^)]*\)/g, '');
    if (RAW_LENGTH.test(rest)) return true;
  }
  return false;
}

const all = DIRS.flatMap((d) => files(join(ROOT, d)));
const cases = all.map((f) => [f.replace(ROOT, 'src/'), f]);

describe('цвета только из токенов', () => {
  it('файлы найдены', () => {
    expect(all.length).toBeGreaterThan(5);
  });

  it.each(cases)('%s', (_name, file) => {
    expect(violations(file, (line) => COLOR.test(line))).toEqual([]);
  });
});

describe('размер текста только из токенов', () => {
  it('правило ловит числа и пропускает токены', () => {
    expect(hasRawFontSize('  font-size: 11px;')).toBe(true);
    expect(hasRawFontSize('  font-size: 1.2rem;')).toBe(true);
    expect(hasRawFontSize('  font: 600 14px/1.2 var(--font-sans);')).toBe(true);
    expect(hasRawFontSize('  font: 600 14px/1.2 Inter;')).toBe(true);
    expect(hasRawFontSize('<span style="font-size:13px">')).toBe(true);
    expect(hasRawFontSize('  font-size: var(--fs-caption);')).toBe(false);
    expect(hasRawFontSize('  font-size: calc(var(--fs-body) * 1.2);')).toBe(false);
    expect(hasRawFontSize('  font-size: calc(var(--fs-body) - 2px);')).toBe(false);
    expect(hasRawFontSize('  font-size: calc(10px + 2px);')).toBe(true);
    expect(hasRawFontSize('  font: var(--fs-body) / var(--lh-body) var(--font-sans);')).toBe(false);
    expect(hasRawFontSize('  font-size: 90%;')).toBe(false);
    expect(hasRawFontSize('  font: inherit;')).toBe(false);
    expect(hasRawFontSize('  font-weight: 600;')).toBe(false);
  });

  it.each(cases)('%s', (_name, file) => {
    expect(violations(file, hasRawFontSize)).toEqual([]);
  });
});
