// Правило дизайн-системы: цвета и тени задаются только в tokens.css.

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

describe('цвета только из токенов', () => {
  const all = DIRS.flatMap((d) => files(join(ROOT, d)));

  it('файлы найдены', () => {
    expect(all.length).toBeGreaterThan(5);
  });

  it.each(all.map((f) => [f.replace(ROOT, 'src/'), f]))('%s', (_name, file) => {
    const bad = readFileSync(file, 'utf8')
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => COLOR.test(line.replace(/\/\/.*$/, '')));
    expect(bad.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });
});
