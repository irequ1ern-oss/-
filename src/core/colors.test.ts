import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import scheduleJson from '../../data/schedule.json';
import { AUTO_COLORS, MIN_SAME_DAY_DISTANCE, SUBJECT_COLORS, SUBJECT_HEX, assignSubjectColors, colorDistance } from './colors';
import type { MainSchedule } from './schedule';
import { WEEKDAY_KEYS } from './time';

const main = scheduleJson as MainSchedule;

describe('colorDistance', () => {
  it('палитры для расчёта совпадают с --sc-* в tokens.css (светлая и тёмная/AMOLED)', () => {
    const css = readFileSync(new URL('../ui/tokens.css', import.meta.url), 'utf8');
    for (const c of SUBJECT_COLORS) {
      const values = [...css.matchAll(new RegExp(`--sc-${c}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1].toUpperCase());
      expect(values[0], c).toBe(SUBJECT_HEX.light[c]);
      expect(values.length, c).toBeGreaterThan(1);
      for (const v of values.slice(1)) expect(v, c).toBe(SUBJECT_HEX.dark[c]);
    }
  });

  it('без темы — меньшее из светлой и тёмной (бирюзовый и голубой близки в тёмной)', () => {
    const light = colorDistance('teal', 'cyan', 'light');
    const dark = colorDistance('teal', 'cyan', 'dark');
    expect(dark).toBeLessThan(light);
    expect(colorDistance('teal', 'cyan')).toBe(dark);
    expect(dark).toBeLessThan(MIN_SAME_DAY_DISTANCE);
  });
});

describe('assignSubjectColors на настоящем расписании', () => {
  const colors = assignSubjectColors(main.subjects, main.week);

  it('цвет есть у каждого предмета, без красного, розового и серого', () => {
    for (const s of main.subjects) {
      expect(AUTO_COLORS).toContain(colors[s.id]);
    }
  });

  it('предметы одного дня различаются по цвету', () => {
    for (const key of WEEKDAY_KEYS) {
      const ids = [...new Set((main.week[key] ?? []).map((l) => l.subjectId))];
      const used = ids.map((id) => colors[id]);
      expect(new Set(used).size, `${key}: ${ids.join(', ')} → ${used.join(', ')}`).toBe(ids.length);
    }
  });

  it(`предметы одного дня заметно различаются и в светлой, и в тёмной теме (ΔE ≥ ${MIN_SAME_DAY_DISTANCE})`, () => {
    for (const key of WEEKDAY_KEYS) {
      const ids = [...new Set((main.week[key] ?? []).map((l) => l.subjectId))];
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = [colors[ids[i]], colors[ids[j]]];
          for (const theme of ['light', 'dark'] as const) {
            expect(colorDistance(a, b, theme), `${key} ${theme}: ${ids[i]}=${a}, ${ids[j]}=${b}`).toBeGreaterThanOrEqual(MIN_SAME_DAY_DISTANCE);
          }
        }
    }
  });

  it(`пары, идущие подряд, заметно непохожи в обеих темах (ΔE ≥ ${MIN_SAME_DAY_DISTANCE})`, () => {
    for (const key of WEEKDAY_KEYS) {
      const lessons = main.week[key] ?? [];
      for (let i = 1; i < lessons.length; i++) {
        const a = colors[lessons[i - 1].subjectId];
        const b = colors[lessons[i].subjectId];
        if (lessons[i - 1].subjectId === lessons[i].subjectId) continue;
        for (const theme of ['light', 'dark'] as const) {
          expect(colorDistance(a, b, theme), `${key} ${theme}: ${a} → ${b}`).toBeGreaterThanOrEqual(MIN_SAME_DAY_DISTANCE);
        }
      }
    }
  });

  it('результат стабилен и уважает цвет из schedule.json', () => {
    expect(assignSubjectColors(main.subjects, main.week)).toEqual(colors);
    const withColor = main.subjects.map((s) => (s.id === 'mss' ? { ...s, color: 'red' } : s));
    expect(assignSubjectColors(withColor, main.week).mss).toBe('red');
  });
});
