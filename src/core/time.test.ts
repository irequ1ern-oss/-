import { describe, expect, it } from 'vitest';
import {
  addDays, diffDays, isValidDate, isValidTime, moscowClock, parseClockOverride, startOfWeek, toMinutes, weekdayKey,
} from './time';

describe('moscowClock', () => {
  it('переводит момент времени в московские дату и минуты', () => {
    expect(moscowClock(new Date('2026-10-09T07:30:00Z'))).toEqual({ date: '2026-10-09', minutes: 10 * 60 + 30 });
  });

  it('после 21:00 UTC в Москве уже следующий день', () => {
    expect(moscowClock(new Date('2026-10-09T21:15:00Z'))).toEqual({ date: '2026-10-10', minutes: 15 });
  });
});

describe('даты', () => {
  it('addDays переходит через месяц и год', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('diffDays', () => {
    expect(diffDays('2026-10-09', '2026-10-12')).toBe(3);
    expect(diffDays('2026-10-12', '2026-10-09')).toBe(-3);
  });

  it('день недели и начало недели', () => {
    expect(weekdayKey('2026-10-09')).toBe('fri');
    expect(weekdayKey('2026-10-11')).toBe('sun');
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
  });

  it('проверка формата', () => {
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidTime('09:00')).toBe(true);
    expect(isValidTime('9:00')).toBe(false);
    expect(isValidTime('24:00')).toBe(false);
    expect(toMinutes('13:55')).toBe(835);
  });
});

describe('parseClockOverride', () => {
  it('разбирает ?now=', () => {
    expect(parseClockOverride('2026-10-12T09:30')).toEqual({ date: '2026-10-12', minutes: 570 });
    expect(parseClockOverride('2026-10-12')).toEqual({ date: '2026-10-12', minutes: 480 });
    expect(parseClockOverride('вчера')).toBeNull();
    expect(parseClockOverride(null)).toBeNull();
  });
});
