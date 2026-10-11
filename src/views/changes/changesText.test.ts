import { describe, expect, it } from 'vitest';
import scheduleJson from '../../../data/schedule.json';
import { cancelDayOverride, cancelLessonOverride, newPeriod, type Stamp } from '../../core/changes';
import { holidayRows } from '../../core/holidays';
import type { DateOverride, MainSchedule, SchedulePeriod, ScheduleSources } from '../../core/schedule';
import {
  activeChangesCount,
  changesPath,
  dateLines,
  dayTitleLong,
  dayTitleShort,
  daysCount,
  daysOffSummary,
  defaultPeriodDates,
  fieldDate,
  holidayItems,
  lessonLength,
  listedDateGroups,
  nextMonday,
  overlapNote,
  overlappingPeriods,
  parseChangesPath,
  periodSavedText,
  periodSubtitle,
  pickDaySubtitle,
  pickDayTitle,
  subgroupRoomsHint,
  suggestSlot,
  wasText,
  type ChangesRoute,
} from './changesText';

const main = scheduleJson as MainSchedule;
const MON = '2026-10-12';

let n = 0;
const stamp = (): Stamp => {
  n++;
  return { id: `t${n}`, now: new Date(Date.UTC(2026, 9, 1, 7, 0, 0, n)).toISOString() };
};
const src = (extra: Partial<ScheduleSources> = {}): ScheduleSources => ({ main, periods: [], overrides: [], ...extra });
const period = (from: string, to: string, title = 'Временное расписание'): SchedulePeriod =>
  newPeriod('custom', from, to, stamp(), { mainWeek: main.week, title });

describe('даты', () => {
  it('заголовки дня', () => {
    expect(dayTitleShort('2026-10-15')).toBe('Чт, 15 октября');
    expect(dayTitleLong('2026-10-15')).toBe('Четверг, 15 октября');
  });

  it('дата в поле: другой год — с годом, пустая — «Не выбрано»', () => {
    expect(fieldDate('2026-10-15', MON)).toBe('Чт, 15 октября');
    expect(fieldDate('2027-01-01', MON)).toBe('Пт, 1 января 2027');
    expect(fieldDate('', MON)).toBe('Не выбрано');
  });

  it('новое расписание начинается с ближайшего понедельника', () => {
    expect(nextMonday(MON)).toBe(MON);
    expect(nextMonday('2026-10-14')).toBe('2026-10-19');
    expect(nextMonday('2026-10-18')).toBe('2026-10-19');
    expect(defaultPeriodDates('practice', '2026-10-14')).toEqual({ from: '2026-10-19', to: '2026-10-30' });
    expect(defaultPeriodDates('custom', MON)).toEqual({ from: MON, to: '2026-10-23' });
    expect(defaultPeriodDates('break', MON)).toEqual({ from: MON, to: '2026-10-18' });
  });

  it('длина промежутка', () => {
    expect(daysCount(MON, MON)).toBe('1 день');
    expect(daysCount(MON, '2026-10-23')).toBe('12 дней');
    expect(daysCount(MON, '2026-10-13')).toBe('2 дня');
    expect(daysCount('2026-10-13', MON)).toBe('');
  });
});

describe('адреса экранов', () => {
  const routes: ChangesRoute[] = [
    { screen: 'list' },
    { screen: 'day', date: '2026-10-15' },
    { screen: 'period', id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed' },
    { screen: 'new', kind: 'practice' },
    { screen: 'new', kind: 'custom' },
    { screen: 'new', kind: 'break' },
  ];

  it.each(routes)('туда и обратно: %o', (r) => {
    const [section, id] = changesPath(r);
    expect(section).toBe('changes');
    expect(parseChangesPath(id)).toEqual(r);
  });

  it('испорченный адрес — null (покажем список)', () => {
    expect(parseChangesPath('day-2026-13-40')).toBeNull();
    expect(parseChangesPath('new-holiday')).toBeNull();
    expect(parseChangesPath('whatever')).toBeNull();
    expect(parseChangesPath(undefined)).toEqual({ screen: 'list' });
  });
});

describe('временные расписания', () => {
  it('подпись строки: действует сейчас, начнётся через …, прошло', () => {
    expect(periodSubtitle({ from: '2026-10-05', to: '2026-10-16' }, MON)).toBe('5–16 октября · действует сейчас');
    expect(periodSubtitle({ from: '2026-10-13', to: '2026-10-16' }, MON)).toBe('13–16 октября · с завтра');
    expect(periodSubtitle({ from: '2026-11-02', to: '2026-11-13' }, MON)).toBe('2–13 ноября · через 3 недели');
    expect(periodSubtitle({ from: '2026-10-15', to: '2026-10-16' }, MON)).toBe('15–16 октября · через 3 дня');
    expect(periodSubtitle({ from: '2026-09-28', to: '2026-10-09' }, MON)).toBe('28 сентября – 9 октября');
  });

  it('текст уведомления после сохранения', () => {
    expect(periodSavedText('practice', true)).toBe('Практика добавлена');
    expect(periodSavedText('custom', false)).toBe('Временное расписание сохранено');
    expect(periodSavedText('break', true)).toBe('Каникулы добавлены');
  });

  it('пересечения: сам с собой и удалённые не считаются', () => {
    const a = period('2026-10-19', '2026-10-30', 'Практика');
    const b = period('2026-10-26', '2026-11-06');
    const gone = { ...period('2026-10-19', '2026-10-20'), deleted: true };
    const list = [a, b, gone];
    expect(overlappingPeriods(a, list).map((p) => p.id)).toEqual([b.id]);
    expect(overlappingPeriods({ id: '', from: '2026-11-09', to: '2026-11-10' }, list)).toEqual([]);
    expect(overlapNote([a], true)).toBe('Пересекается с «Практика» (19–30 октября). В общие дни будет действовать это расписание.');
    // Старое расписание, которое правят: в общие дни действует созданное позже.
    expect(overlapNote([b], false, a.createdAt)).toMatch(/действует то, что создано позже/);
    expect(overlapNote([], true)).toBe('');
  });

  it('сколько изменений впереди — для строки в «Настройках»', () => {
    const past = period('2026-09-28', '2026-10-09');
    const now = period('2026-10-05', '2026-10-16');
    const overrides: DateOverride[] = [
      cancelLessonOverride(MON, '09:00', stamp()),
      cancelLessonOverride(MON, '10:50', stamp()),
      cancelLessonOverride('2026-10-20', '09:00', stamp()),
      cancelLessonOverride('2026-10-09', '09:00', stamp()),
      { ...cancelDayOverride('2026-10-21', stamp()), deleted: true },
    ];
    expect(activeChangesCount({ periods: [past, now], overrides }, MON)).toBe(3);
    // Отмеченный праздник виден в «Праздниках» — в счёт и в список дат не идёт.
    const holiday = cancelDayOverride('2026-11-04', stamp(), 'День народного единства');
    expect(activeChangesCount({ periods: [], overrides: [holiday] }, MON)).toBe(0);
  });

  it('даты в списке: дни только с отметкой праздника — в «Праздниках», с другими изменениями — тоже в списке', () => {
    const holiday = cancelDayOverride('2026-11-04', stamp(), 'День народного единства');
    const ownDayOff = cancelDayOverride('2026-11-05', stamp(), 'Отгул');
    const pastHoliday = cancelDayOverride('2026-10-04', stamp(), 'День народного единства'); // не праздник — своя причина
    let list = listedDateGroups([holiday, ownDayOff, pastHoliday], MON);
    expect(list.upcoming.map((g) => g.date)).toEqual(['2026-11-05']);
    expect(list.past.map((g) => g.date)).toEqual(['2026-10-04']);
    expect(list.holidays).toBe(1);
    list = listedDateGroups([holiday, cancelLessonOverride('2026-11-04', '09:00', stamp())], MON);
    expect(list.upcoming.map((g) => g.overrides.length)).toEqual([2]);
    expect(list.holidays).toBe(0);
  });
});

describe('пары', () => {
  it('время новой пары — после последней', () => {
    expect(suggestSlot([])).toEqual({ start: '09:00', end: '10:40' });
    expect(suggestSlot([{ start: '09:00', end: '10:40' }, { start: '13:00', end: '14:40' }])).toEqual({ start: '14:50', end: '16:30' });
    expect(suggestSlot([{ start: '21:00', end: '23:00' }])).toEqual({ start: '22:00', end: '23:40' });
  });

  it('длительность пары', () => {
    expect(lessonLength('09:00', '10:40')).toBe('1 ч 40 мин');
    expect(lessonLength('10:40', '09:00')).toBe('');
    expect(lessonLength('', '09:00')).toBe('');
  });

  it('«было: …» — только то, что поменялось', () => {
    const name = (id: string) => main.subjects.find((s) => s.id === id)?.short ?? id;
    const was = { start: '09:00', end: '10:40', subjectId: 'ig', rooms: ['27', '25'] };
    expect(wasText({ ...was, subjectId: 'history' }, was, 1, name)).toBe('было: ИГ');
    expect(wasText({ start: '09:00', end: '10:40', subjectId: 'ig', room: '12' }, was, 2, name)).toBe('было: каб. 25');
    expect(wasText({ start: '10:00', end: '11:40', subjectId: 'ig', room: '' }, was, 1, name)).toBe('было: 09:00–10:40, каб. 27');
    expect(wasText(was, undefined, 1, name)).toBe('');
  });

  it('подсказка про кабинеты подгрупп', () => {
    expect(subgroupRoomsHint({ rooms: ['27', '25'] })).toMatch(/27 и 25/);
    expect(subgroupRoomsHint({ rooms: ['27', '27'] })).toBe('');
    expect(subgroupRoomsHint({ room: '27' })).toBe('');
  });
});

describe('изменения на даты и праздники', () => {
  it('подпись строки даты — не больше двух строк', () => {
    expect(dateLines(['a'])).toBe('a');
    expect(dateLines(['a', 'b'])).toBe('a\nb');
    expect(dateLines(['a', 'b', 'c'])).toBe('a\nи ещё 2 изменения');
    expect(dateLines(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('a\nи ещё 5 изменений');
  });

  it('праздники: каждый отдельно, январские дни — одной строкой', () => {
    const items = holidayItems(holidayRows('2026-10-10', src()));
    expect(items.map((i) => i.title)).toEqual([
      'День народного единства',
      'Новогодние каникулы',
      'День защитника Отечества',
      'Международный женский день',
      // 1 мая 2027 — суббота, пар нет; отмечать нужно перенесённый выходной 3 мая.
      'Перенос выходного (Праздник Весны и Труда)',
      'Перенос выходного (День Победы)',
      'Перенос выходного (День России)',
    ]);
    const ny = items[1];
    expect(ny.subtitle).toBe('1–8 января · 6 учебных дней');
    expect(ny.holidays.map((h) => h.date)).toEqual(['2027-01-01', '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08']);
    expect(items[0]).toMatchObject({ subtitle: '4 ноября, среда', label: '4 ноября, среда — День народного единства', on: false });
  });

  it('отмеченный праздник — включён; новогодние — только когда отмечены все дни', () => {
    const marks = [cancelDayOverride('2026-11-04', stamp(), 'День народного единства'), cancelDayOverride('2027-01-04', stamp(), 'Новогодние каникулы')];
    const items = holidayItems(holidayRows('2026-10-10', src({ overrides: marks })));
    expect(items[0]).toMatchObject({ on: true, marks: [marks[0]] });
    expect(items[1]).toMatchObject({ on: false, marks: [marks[1]] });
  });
});

describe('выбор дня', () => {
  it('заголовок и подпись', () => {
    expect(pickDayTitle(MON, MON)).toBe('Сегодня');
    expect(pickDayTitle('2026-10-13', MON)).toBe('Завтра');
    expect(pickDayTitle('2026-10-14', MON)).toBe('Ср, 14 октября');
    const lessons = [{ start: '10:50', end: '12:40' }, { start: '09:00', end: '10:40' }];
    expect(pickDaySubtitle(MON, MON, lessons, false)).toBe('Пн, 12 октября · 2 пары · 09:00–12:40');
    expect(pickDaySubtitle('2026-10-14', MON, lessons, false)).toBe('2 пары · 09:00–12:40');
    expect(pickDaySubtitle('2026-10-14', MON, [], true)).toBe('Пар нет весь день');
    expect(pickDaySubtitle('2026-10-18', MON, [], false)).toBe('Пар нет');
  });

  it('сколько учебных дней отменится', () => {
    expect(daysOffSummary(1)).toBe('Отменятся пары в 1 учебный день');
    expect(daysOffSummary(3)).toBe('Отменятся пары в 3 учебных дня');
    expect(daysOffSummary(5)).toBe('Отменятся пары в 5 учебных дней');
    expect(daysOffSummary(0)).toBe('');
  });
});
