import { describe, expect, it } from 'vitest';
import { defaultStripDay, shiftStripDay, upcomingLessonsOfSubject, weekDays } from './week';
import { override, sources } from './testData';
import { clockAt } from './time';

describe('полоса дней на «Неделе»', () => {
  it('Пн–Пт, суббота появляется только с парами', () => {
    expect(weekDays('2026-10-12', sources()).map((d) => d.date)).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16',
    ]);
    const sat = sources({ overrides: [override({ date: '2026-10-17', action: 'add', lesson: { start: '09:00', end: '10:00', subjectId: 'ig' } })] });
    expect(weekDays('2026-10-12', sat).map((d) => d.date)).toContain('2026-10-17');
  });

  it('свайп листает дни, на краю недели — соседняя неделя', () => {
    expect(shiftStripDay('2026-10-13', 1, sources())).toBe('2026-10-14');
    expect(shiftStripDay('2026-10-16', 1, sources())).toBe('2026-10-19');
    expect(shiftStripDay('2026-10-12', -1, sources())).toBe('2026-10-09');
  });

  it('по умолчанию сегодня, а в выходной — понедельник', () => {
    expect(defaultStripDay('2026-10-14', sources())).toBe('2026-10-14');
    expect(defaultStripDay('2026-10-17', sources())).toBe('2026-10-19');
    expect(defaultStripDay('2026-10-18', sources())).toBe('2026-10-19');
  });
});

describe('ближайшие пары предмета', () => {
  it('сегодняшние незакончившиеся и следующие 7 дней', () => {
    const list = upcomingLessonsOfSubject('mss', clockAt('2026-10-12', '10:00'), sources());
    expect(list.map((l) => `${l.date} ${l.start}`)).toEqual(['2026-10-12 09:00', '2026-10-16 13:00']);
    const later = upcomingLessonsOfSubject('mss', clockAt('2026-10-12', '11:00'), sources());
    expect(later.map((l) => l.date)).toEqual(['2026-10-16']);
  });
});
