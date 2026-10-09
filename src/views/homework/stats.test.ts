import { describe, expect, it } from 'vitest';
import { dayHasOverdue, doneOnTime, hasOverdue, streakDays, weekStats, type TrackedHomework } from './stats';

const hw = (id: string, due: string, done = false, doneAt?: string): TrackedHomework => ({
  id, subjectId: 'mss', title: id, due, done, ...(doneAt ? { doneAt } : {}),
});

// 2026-10-14 — среда; неделя 12–18 октября.
const TODAY = '2026-10-14';

describe('weekStats', () => {
  it('считает только задания со сроком на этой неделе (пн–вс)', () => {
    const items = [
      hw('a', '2026-10-11', true), // прошлое воскресенье — не входит
      hw('b', '2026-10-12', true),
      hw('c', '2026-10-14'),
      hw('d', '2026-10-18', true),
      hw('e', '2026-10-19', true), // следующий понедельник — не входит
    ];
    expect(weekStats(items, TODAY)).toEqual({ total: 3, done: 2, onTime: 2 });
  });

  it('сделанное позже срока не считается «вовремя»', () => {
    const items = [hw('a', '2026-10-12', true, '2026-10-13'), hw('b', '2026-10-13', true, '2026-10-13')];
    expect(weekStats(items, TODAY)).toEqual({ total: 2, done: 2, onTime: 1 });
  });

  it('пустой список', () => {
    expect(weekStats([], TODAY)).toEqual({ total: 0, done: 0, onTime: 0 });
  });

  it('в воскресенье неделя та же, с понедельника', () => {
    expect(weekStats([hw('a', '2026-10-12', true)], '2026-10-18').total).toBe(1);
  });
});

describe('doneOnTime', () => {
  it('без даты отметки считается вовремя', () => {
    expect(doneOnTime(hw('a', '2026-10-10', true))).toBe(true);
    expect(doneOnTime(hw('a', '2026-10-10', false))).toBe(false);
    expect(doneOnTime(hw('a', '2026-10-10', true, '2026-10-10'))).toBe(true);
    expect(doneOnTime(hw('a', '2026-10-10', true, '2026-10-11'))).toBe(false);
  });
});

describe('dayHasOverdue', () => {
  it('невыполненное со сроком раньше дня — просрочка', () => {
    expect(dayHasOverdue([hw('a', '2026-10-13')], TODAY)).toBe(true);
    expect(dayHasOverdue([hw('a', '2026-10-14')], TODAY)).toBe(false);
  });

  it('отмеченное в этот день или позже — день с просрочкой', () => {
    const late = hw('a', '2026-10-12', true, '2026-10-14');
    expect(dayHasOverdue([late], '2026-10-13')).toBe(true);
    expect(dayHasOverdue([late], '2026-10-14')).toBe(true);
    expect(dayHasOverdue([late], '2026-10-15')).toBe(false);
  });
});

describe('streakDays', () => {
  it('просрочка сегодня — серия 0', () => {
    expect(streakDays([hw('a', '2026-10-13'), hw('b', '2026-10-01', true)], TODAY)).toBe(0);
  });

  it('считается от самого раннего срока, включая сегодня', () => {
    expect(streakDays([hw('a', '2026-10-10', true), hw('b', '2026-10-20')], TODAY)).toBe(5);
  });

  it('все сроки впереди — сегодня уже без просрочек', () => {
    expect(streakDays([hw('a', '2026-10-20')], TODAY)).toBe(1);
  });

  it('обрывается на последнем дне с просрочкой', () => {
    // Срок 8-го, отмечено 11-го: просрочка 9, 10, 11-го. Чистые дни — 12, 13, 14-го.
    const items = [hw('a', '2026-10-01', true), hw('b', '2026-10-08', true, '2026-10-11')];
    expect(streakDays(items, TODAY)).toBe(3);
  });

  it('отмечено сегодня с опозданием — сегодня ещё не в серии', () => {
    expect(streakDays([hw('a', '2026-10-13', true, TODAY)], TODAY)).toBe(0);
  });

  it('пустой список — 0, длинная история ограничена годом', () => {
    expect(streakDays([], TODAY)).toBe(0);
    expect(streakDays([hw('a', '2020-01-01', true)], TODAY)).toBe(365);
  });
});

describe('hasOverdue', () => {
  it('только невыполненные со сроком раньше сегодня', () => {
    expect(hasOverdue([hw('a', '2026-10-13', true)], TODAY)).toBe(false);
    expect(hasOverdue([hw('a', '2026-10-13')], TODAY)).toBe(true);
    expect(hasOverdue([hw('a', TODAY)], TODAY)).toBe(false);
  });
});
