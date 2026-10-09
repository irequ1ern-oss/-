import { describe, expect, it } from 'vitest';
import { computeTodayView } from './today';
import { override, period, sources } from './testData';
import { clockAt } from './time';

const at = clockAt;

describe('computeTodayView', () => {
  it('во время пары: текущая, сколько до конца, следующая', () => {
    const v = computeTodayView(at('2026-10-12', '10:17'), sources());
    expect(v.isToday).toBe(true);
    expect(v.current?.lesson.subjectId).toBe('mss');
    expect(v.current?.minutesLeft).toBe(23);
    expect(v.next?.lesson.subjectId).toBe('pfo');
    expect(v.next?.minutesUntil).toBe(33);
    expect(v.inBreak).toBe(false);
  });

  it('на перемене', () => {
    const v = computeTodayView(at('2026-10-12', '10:45'), sources());
    expect(v.current).toBeUndefined();
    expect(v.inBreak).toBe(true);
    expect(v.next?.minutesUntil).toBe(5);
  });

  it('до первой пары — не перемена', () => {
    const v = computeTodayView(at('2026-10-12', '07:30'), sources());
    expect(v.inBreak).toBe(false);
    expect(v.next?.lesson.start).toBe('09:00');
    expect(v.next?.minutesUntil).toBe(90);
  });

  it('после последней пары показывает следующий учебный день', () => {
    const v = computeTodayView(at('2026-10-12', '12:40'), sources());
    expect(v.isToday).toBe(false);
    expect(v.reason).toBe('finished');
    expect(v.day.date).toBe('2026-10-14'); // во вторник пар нет в тестовом расписании
    expect(v.daysAhead).toBe(2);
  });

  it('в пятницу вечером и в выходные показывает понедельник', () => {
    expect(computeTodayView(at('2026-10-16', '18:00'), sources()).day.date).toBe('2026-10-19');
    const sat = computeTodayView(at('2026-10-17', '10:00'), sources());
    expect(sat.day.date).toBe('2026-10-19');
    expect(sat.reason).toBe('free');
  });

  it('если все пары сегодня отменены — показывает следующий день и причину', () => {
    const src = sources({ overrides: [override({ date: '2026-10-12', action: 'cancelDay' })] });
    const v = computeTodayView(at('2026-10-12', '08:00'), src);
    expect(v.isToday).toBe(false);
    expect(v.reason).toBe('cancelled');
  });

  it('на каникулах показывает первый учебный день после них', () => {
    const src = sources({ periods: [period({ from: '2026-10-26', to: '2026-11-08', title: 'Каникулы' })] });
    const v = computeTodayView(at('2026-10-27', '10:00'), src);
    expect(v.day.date).toBe('2026-11-09');
    expect(v.today.period?.title).toBe('Каникулы');
  });

  it('если пар не найдено совсем', () => {
    const src = sources({ periods: [period({ from: '2026-01-01', to: '2027-12-31', title: 'Пусто' })] });
    expect(computeTodayView(at('2026-10-12', '10:00'), src).nothingAhead).toBe(true);
  });
});
