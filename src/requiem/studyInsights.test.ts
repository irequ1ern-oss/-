import { describe, expect, it } from 'vitest';
import { calendarDays } from '../ui/DatePicker';
import {
  percentage,
  studyInsights,
  dayPresets,
  trainPresets,
} from './studyInsights';
import { weekdayIndex } from '../core/time';
import type { Entry, Fields, Lesson } from './client';

const date = '2026-11-27';
function mark(
  day: string,
  status: string,
  start = '09:00',
  end = '09:45',
): Entry {
  return {
    kind: 'attendance',
    id: day + start,
    version: 1,
    updated: '',
    data: { date: day, subject: 'math', start, end, status },
  };
}
const lessons: Lesson[] = [
  ['09:00', '09:45'],
  ['09:55', '10:40'],
  ['13:00', '13:45'],
  ['13:55', '14:40'],
].map(([start, end]) => ({
  date,
  start,
  end,
  title: 'Предмет',
  subject: 's',
  room: '',
}));
describe('Статистика журнала', () => {
  it('сравнивает соседние периоды, исключает уважительные и будущие уроки', () => {
    const { current, previous } = studyInsights(
      [
        mark(date, 'late'),
        mark(date, 'absent', '09:55', '10:25'),
        mark('2026-11-26', 'excused'),
        mark('2026-11-20', 'present'),
        mark('2026-11-28', 'absent'),
      ],
      date,
      7,
    );
    expect(percentage(current.total)).toBe(50);
    expect(percentage(previous.total)).toBe(100);
    expect(current.days).toBe(2);
    expect(current.missedMinutes).toBe(30);
    expect(current.subjects.get('math')).toEqual({
      late: 1,
      present: 0,
      absent: 1,
      excused: 1,
    });
  });
  it('считает повтор по разным пятницам, даже если в пятницу пропущено несколько уроков', () => {
    const { current } = studyInsights(
      [
        mark(date, 'absent'),
        mark(date, 'absent', '09:55', '10:40'),
        mark('2026-11-20', 'absent'),
      ],
      date,
      28,
    );
    expect(current.weeklyDates[4]).toEqual({ logged: 2, missed: 2 });
  });
  it('отличает пустой журнал и уважительную причину от нулевой посещаемости', () => {
    expect(percentage(studyInsights([], date, 7).current.total)).toBeNull();
    expect(
      percentage(studyInsights([mark(date, 'excused')], date, 7).current.total),
    ).toBeNull();
    expect(
      percentage(studyInsights([mark(date, 'absent')], date, 7).current.total),
    ).toBe(0);
  });
});
describe('Сценарии', () => {
  it('учитывает окно, раздельные уроки и день без занятий', () => {
    expect(dayPresets([])).toEqual([]);
    expect(dayPresets(lessons).map((p) => p.starts)).toEqual([
      [],
      ['09:00', '09:55'],
      ['13:00', '13:55'],
      lessons.map((l) => l.start),
    ]);
    expect(dayPresets(lessons.slice(0, 1))).toHaveLength(2);
  });
  it('задаёт порог по рейсу с задержкой, отбор по дате и направлению', () => {
    const trip: Entry = {
      ...mark(date, 'present'),
      kind: 'trip',
      data: {
        date,
        direction: 'out',
        number: '42',
        departure: '14:40',
        delay: 5,
      },
    };
    const overrides: Fields[] = [
      { cancelled: true },
      { direction: 'in' },
      { date: '2026-11-28' },
    ];
    const trips = [
      trip,
      ...overrides.map((extra) => ({
        ...trip,
        data: { ...trip.data, ...extra },
      })),
    ];
    const [match, ...others] = trainPresets({ date, lessons, records: trips });
    expect(others).toHaveLength(0);
    expect(match.leave).toBe(825);
    expect(match.starts).toEqual(['13:55']);
    expect(
      trainPresets({
        date,
        lessons,
        records: [{ ...trip, data: { ...trip.data, delay: 4 } }],
      })[0].starts,
    ).toEqual(['13:00', '13:55']);
  });
});
describe('Календарь', () => {
  it.each(['2024-02-13', '2026-11-27', '2027-01-01'])(
    'шесть недель начиная с понедельника, %s',
    (date) => {
      const days = calendarDays(date);
      expect(days).toHaveLength(42);
      expect(weekdayIndex(days[0])).toBe(0);
      expect(days).toContain(date);
      expect(new Set(days).size).toBe(42);
    },
  );
  it('показывает високосный день и предыдущий год', () => {
    expect(calendarDays('2024-02-01')).toContain('2024-02-29');
    expect(calendarDays('2027-01-01')[0]).toBe('2026-12-28');
  });
});
