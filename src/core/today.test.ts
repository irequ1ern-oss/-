import { describe, expect, it } from 'vitest';
import { computeHero } from './hero';
import type { ResolvedLesson } from './schedule';
import { period, sources } from './testData';
import { lessonPhase } from './today';
import { clockAt } from './time';

const lesson = (date: string, start: string, end: string): ResolvedLesson => ({
  date,
  start,
  end,
  subjectId: 'mss',
  source: 'main',
  status: 'normal',
});

describe('lessonPhase', () => {
  const l = lesson('2026-10-12', '09:00', '10:40');

  it('другой день: раньше — прошла, позже — впереди', () => {
    expect(lessonPhase(l, clockAt('2026-10-13', '08:00'))).toBe('past');
    expect(lessonPhase(l, clockAt('2026-10-11', '12:00'))).toBe('upcoming');
  });

  it('в тот же день: до начала — впереди, с начала — идёт, с конца — прошла', () => {
    expect(lessonPhase(l, clockAt('2026-10-12', '08:59'))).toBe('upcoming');
    expect(lessonPhase(l, clockAt('2026-10-12', '09:00'))).toBe('current');
    expect(lessonPhase(l, clockAt('2026-10-12', '10:39'))).toBe('current');
    expect(lessonPhase(l, clockAt('2026-10-12', '10:40'))).toBe('past');
  });
});

describe('если пар не найдено совсем', () => {
  it('главный блок показывает день без пар и без следующего учебного дня', () => {
    const src = sources({ periods: [period({ from: '2026-01-01', to: '2027-12-31', title: 'Пусто' })] });
    const { hero } = computeHero(clockAt('2026-10-12', '10:00'), src);
    expect(hero.kind).toBe('dayoff');
    expect(hero.kind === 'dayoff' && hero.next).toBeNull();
  });
});
