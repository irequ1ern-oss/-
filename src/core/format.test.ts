import { describe, expect, it } from 'vitest';
import { forDayLabel, formatDuration, formatRoom, formatTimer, formatWeekRange, greeting, lessonsCount } from './format';

describe('подписи', () => {
  it('кабинет', () => {
    expect(formatRoom('27')).toBe('каб. 27');
    expect(formatRoom('С')).toBe('каб. С');
    expect(formatRoom('27/25')).toBe('каб. 27/25');
    expect(formatRoom('Спортзал')).toBe('Спортзал');
    expect(formatRoom(undefined)).toBe('');
  });

  it('таймер с секундами', () => {
    expect(formatTimer(27 * 60 + 12)).toBe('27:12');
    expect(formatTimer(65)).toBe('1:05');
    expect(formatTimer(9)).toBe('0:09');
    expect(formatTimer(3600 + 5 * 60 + 9)).toBe('1:05:09');
    expect(formatTimer(-3)).toBe('0:00');
  });

  it('приветствие по времени суток', () => {
    const at = (h: number, m = 0) => h * 60 + m;
    expect(greeting(at(5), 'Влад')).toBe('Доброе утро, Влад');
    expect(greeting(at(11, 59), 'Влад')).toBe('Доброе утро, Влад');
    expect(greeting(at(12))).toBe('Добрый день');
    expect(greeting(at(16, 59))).toBe('Добрый день');
    expect(greeting(at(17), ' ')).toBe('Добрый вечер');
    expect(greeting(at(22, 59))).toBe('Добрый вечер');
    expect(greeting(at(23))).toBe('Доброй ночи');
    expect(greeting(at(4, 59))).toBe('Доброй ночи');
  });

  it('«Расписание на …»', () => {
    expect(forDayLabel('2026-10-14', '2026-10-13')).toBe('на завтра');
    expect(forDayLabel('2026-10-19', '2026-10-17')).toBe('на послезавтра');
    expect(forDayLabel('2026-10-19', '2026-10-16')).toBe('на понедельник');
    expect(forDayLabel('2026-10-21', '2026-10-16')).toBe('на среду');
    expect(forDayLabel('2026-11-09', '2026-10-27')).toBe('на понедельник, 9 ноября');
  });

  it('прочее', () => {
    expect(formatDuration(82)).toBe('1 ч 22 мин');
    expect(formatWeekRange('2026-10-05')).toBe('5–9 октября');
    expect(formatWeekRange('2026-09-28')).toBe('28 сентября – 2 октября');
    expect([1, 2, 5, 11, 21].map(lessonsCount)).toEqual(['1 пара', '2 пары', '5 пар', '11 пар', '21 пара']);
  });
});
