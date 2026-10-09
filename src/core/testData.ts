// Небольшое расписание для тестов (не зависит от реального data/schedule.json).

import type { DateOverride, MainSchedule, SchedulePeriod, ScheduleSources } from './schedule';

export const testMain: MainSchedule = {
  version: 1,
  subjects: [
    { id: 'mss', short: 'МСС', full: 'Метрология' },
    { id: 'pfo', short: 'ПФО', full: 'Процессы формообразования' },
    { id: 'ig', short: 'ИГ', full: 'Инженерная графика' },
    { id: 'prac', short: 'Практика', full: 'Учебная практика' },
  ],
  week: {
    mon: [
      { start: '09:00', end: '10:40', subjectId: 'mss', room: '27' },
      { start: '10:50', end: '12:40', subjectId: 'pfo', room: '27' },
    ],
    wed: [{ start: '09:00', end: '09:45', subjectId: 'ig', room: '25' }],
    thu: [
      { start: '09:00', end: '10:40', subjectId: 'ig', room: '27' },
      { start: '10:50', end: '11:35', subjectId: 'ig', room: '27' },
    ],
    fri: [{ start: '13:00', end: '14:40', subjectId: 'mss', room: '27' }],
  },
};

let counter = 0;

export function period(p: Partial<SchedulePeriod> & Pick<SchedulePeriod, 'from' | 'to'>): SchedulePeriod {
  counter++;
  return {
    id: `p${counter}`,
    title: 'Временное',
    week: {},
    createdAt: `2026-10-01T10:00:0${counter % 10}+03:00`,
    updatedAt: `2026-10-01T10:00:0${counter % 10}+03:00`,
    ...p,
  };
}

type OverrideInput = DateOverride extends infer O ? (O extends DateOverride ? Omit<O, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<O, 'id' | 'createdAt' | 'updatedAt'>> : never) : never;

export function override(o: OverrideInput): DateOverride {
  counter++;
  return {
    id: `o${counter}`,
    createdAt: `2026-10-02T10:00:${String(counter % 60).padStart(2, '0')}+03:00`,
    updatedAt: `2026-10-02T10:00:${String(counter % 60).padStart(2, '0')}+03:00`,
    ...o,
  } as DateOverride;
}

export function sources(extra: Partial<ScheduleSources> = {}): ScheduleSources {
  return { main: testMain, periods: [], overrides: [], ...extra };
}
