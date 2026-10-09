import { describe, expect, it } from 'vitest';
import scheduleJson from '../../data/schedule.json';
import { AUTO_COLORS, assignSubjectColors, colorDistance } from './colors';
import type { MainSchedule } from './schedule';
import { WEEKDAY_KEYS } from './time';

const main = scheduleJson as MainSchedule;

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

  it('пары, идущие подряд, заметно непохожи (ΔE ≥ 20)', () => {
    for (const key of WEEKDAY_KEYS) {
      const lessons = main.week[key] ?? [];
      for (let i = 1; i < lessons.length; i++) {
        const a = colors[lessons[i - 1].subjectId];
        const b = colors[lessons[i].subjectId];
        if (lessons[i - 1].subjectId === lessons[i].subjectId) continue;
        expect(colorDistance(a, b), `${key}: ${a} → ${b}`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('результат стабилен и уважает цвет из schedule.json', () => {
    expect(assignSubjectColors(main.subjects, main.week)).toEqual(colors);
    const withColor = main.subjects.map((s) => (s.id === 'mss' ? { ...s, color: 'red' } : s));
    expect(assignSubjectColors(withColor, main.week).mss).toBe('red');
  });
});
