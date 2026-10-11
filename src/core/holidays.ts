// Государственные праздники России — чтобы заранее предложить отметить дни без пар.
// Нерабочие праздники по Трудовому кодексу (ст. 112) и перенос выходного, если праздник выпал на субботу или воскресенье.

import { cancelDayOverride, type Stamp } from './changes';
import { formatDayMonth, weekdayName } from './format';
import { activeLessons, resolveDay, type DateOverride, type ScheduleSources } from './schedule';
import { addDays, isValidDate, weekdayIndex, type DateStr } from './time';

export interface Holiday {
  date: DateStr;
  name: string;
  /** праздник выпал на выходной — это перенесённый выходной */
  transferredFrom?: DateStr;
}

/** Праздники года: месяц-день и название. */
const FIXED: [string, string][] = [
  ['01-01', 'Новогодние каникулы'],
  ['01-02', 'Новогодние каникулы'],
  ['01-03', 'Новогодние каникулы'],
  ['01-04', 'Новогодние каникулы'],
  ['01-05', 'Новогодние каникулы'],
  ['01-06', 'Новогодние каникулы'],
  ['01-07', 'Рождество Христово'],
  ['01-08', 'Новогодние каникулы'],
  ['02-23', 'День защитника Отечества'],
  ['03-08', 'Международный женский день'],
  ['05-01', 'Праздник Весны и Труда'],
  ['05-09', 'День Победы'],
  ['06-12', 'День России'],
  ['11-04', 'День народного единства'],
];

function isWeekend(date: DateStr): boolean {
  return weekdayIndex(date) >= 5;
}

const cache = new Map<number, Holiday[]>();

/**
 * Праздники одного года вместе с переносами.
 * Переносы январских выходных (1–8 января) правительство каждый год объявляет отдельно — их не считаем.
 */
function holidaysOfYear(year: number): Holiday[] {
  const cached = cache.get(year);
  if (cached) return cached;
  const y = String(year).padStart(4, '0');
  const list: Holiday[] = FIXED.map(([md, name]) => ({ date: `${y}-${md}`, name }));
  const taken = new Set(list.map((h) => h.date));
  for (const h of list.slice()) {
    if (h.date.slice(5, 7) === '01' || !isWeekend(h.date)) continue;
    // Следующий рабочий день: не суббота, не воскресенье, не праздник и не занятый другим переносом.
    let d = addDays(h.date, 1);
    while (isWeekend(d) || taken.has(d)) d = addDays(d, 1);
    taken.add(d);
    list.push({ date: d, name: `Перенос выходного (${h.name})`, transferredFrom: h.date });
  }
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  cache.set(year, list);
  return list;
}

/** Праздники и перенесённые выходные с from по to включительно, по дате. */
export function russianHolidays(from: DateStr, to: DateStr): Holiday[] {
  if (!isValidDate(from) || !isValidDate(to) || to < from) return [];
  const out: Holiday[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    for (const h of holidaysOfYear(year)) if (h.date >= from && h.date <= to) out.push({ ...h });
  }
  return out;
}

/** Праздник в этот день (если есть). */
export function holidayOn(date: DateStr): Holiday | undefined {
  return russianHolidays(date, date)[0];
}

/**
 * Праздники ближайших days дней (с сегодняшнего), которые стоит отметить: в этот день по расписанию есть пары
 * и «Пар нет весь день» ещё не отмечено.
 */
export function holidaySuggestions(today: DateStr, src: ScheduleSources, days = 366): Holiday[] {
  if (!isValidDate(today)) return [];
  return russianHolidays(today, addDays(today, Math.max(0, Math.floor(days)))).filter((h) => {
    const day = resolveDay(h.date, src);
    if (day.overrides.some((o) => o.action === 'cancelDay')) return false;
    return activeLessons(day).length > 0;
  });
}

export interface HolidayRow {
  holiday: Holiday;
  /** Отметка «Пар нет весь день» с названием праздника, если уже есть. */
  mark?: DateOverride;
}

/**
 * Праздники для списка с переключателями: ещё не отмеченные (из holidaySuggestions) и уже отмеченные, по дате.
 * Праздник, который закрыт своим выходным с другой причиной, не показываем — с ним делать нечего.
 */
export function holidayRows(today: DateStr, src: ScheduleSources, days = 366): HolidayRow[] {
  if (!isValidDate(today)) return [];
  const to = addDays(today, Math.max(0, Math.floor(days)));
  const rows: HolidayRow[] = holidaySuggestions(today, src, days).map((holiday) => ({ holiday }));
  for (const holiday of russianHolidays(today, to)) {
    const mark = src.overrides.find(
      (o) => !o.deleted && o.date === holiday.date && o.action === 'cancelDay' && o.note?.trim() === holiday.name,
    );
    if (mark) rows.push({ holiday, mark });
  }
  return rows.sort((a, b) => (a.holiday.date < b.holiday.date ? -1 : a.holiday.date > b.holiday.date ? 1 : 0));
}

/** Отметка праздника: «Пар нет весь день» с названием праздника в причине. */
export function holidayMarkOverride(h: Holiday, stamp: Stamp): DateOverride {
  return cancelDayOverride(h.date, stamp, h.name);
}

/** Это отметка праздника (а не свой выходной): «Пар нет весь день» в праздник, причина — его название. */
export function isHolidayMark(o: DateOverride): boolean {
  if (o.action !== 'cancelDay' || !o.note) return false;
  const note = o.note.trim();
  return russianHolidays(o.date, o.date).some((h) => h.name === note);
}

/** «4 ноября, среда — День народного единства» */
export function describeHoliday(h: Holiday): string {
  return `${formatDayMonth(h.date)}, ${weekdayName(h.date)} — ${h.name}`;
}
