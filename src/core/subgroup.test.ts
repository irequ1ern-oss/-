import { describe, expect, it } from 'vitest';
import scheduleJson from '../../data/schedule.json';
import { lessonRoom, resolveDay, type MainSchedule } from './schedule';
import { override, sources } from './testData';

const main = scheduleJson as MainSchedule;
const thu = main.week.thu ?? [];
const fri = main.week.fri ?? [];

describe('кабинеты по подгруппам', () => {
  it('1-я подгруппа: ИГ — 27, Физра — Спортзал, Ин. яз — 21', () => {
    expect(lessonRoom(thu[0], 1)).toBe('27');
    expect(lessonRoom(thu.find((l) => l.subjectId === 'pe')!, 1)).toBe('Спортзал');
    expect(lessonRoom(fri.find((l) => l.subjectId === 'lang')!, 1)).toBe('21');
  });

  it('2-я подгруппа: ИГ — 25, Физра — 3, Ин. яз — 23', () => {
    expect(lessonRoom(thu[0], 2)).toBe('25');
    expect(lessonRoom(thu.find((l) => l.subjectId === 'pe')!, 2)).toBe('3');
    expect(lessonRoom(fri.find((l) => l.subjectId === 'lang')!, 2)).toBe('23');
  });

  it('общий кабинет одинаков для обеих подгрупп', () => {
    const mon = main.week.mon![0];
    expect([lessonRoom(mon, 1), lessonRoom(mon, 2)]).toEqual(['27', '27']);
  });

  it('если кабинета для подгруппы нет — берётся общий или первый', () => {
    expect(lessonRoom({ start: '09:00', end: '10:00', subjectId: 'x', rooms: ['5'] }, 2)).toBe('5');
    expect(lessonRoom({ start: '09:00', end: '10:00', subjectId: 'x' }, 1)).toBeUndefined();
  });

  it('замена кабинета на дату действует для обеих подгрупп', () => {
    const src = sources({
      main: { ...sources().main, week: { mon: [{ start: '09:00', end: '10:40', subjectId: 'ig', rooms: ['27', '25'] }] } },
      overrides: [override({ date: '2026-10-12', action: 'replace', target: '09:00', lesson: { room: '40' } })],
    });
    const l = resolveDay('2026-10-12', src).lessons[0];
    expect([lessonRoom(l, 1), lessonRoom(l, 2)]).toEqual(['40', '40']);
    expect(l.original?.rooms).toEqual(['27', '25']);
  });
});
