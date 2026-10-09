// Подписи экранов настроек, которые считаются из расписания (без отрисовки — их удобно проверять тестами).

import { formatDayMonth, lessonsCount } from '../../core/format';
import { lessonRoom, type Lesson, type MainSchedule } from '../../core/schedule';
import { moscowClock, toMinutes, WEEKDAY_KEYS, type WeekdayKey } from '../../core/time';

export const DAY_TITLES: Record<WeekdayKey, string> = {
  mon: 'Понедельник', tue: 'Вторник', wed: 'Среда', thu: 'Четверг', fri: 'Пятница', sat: 'Суббота', sun: 'Воскресенье',
};

export const DAY_SHORT: Record<WeekdayKey, string> = {
  mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс',
};

/** Дни основного расписания, в которые есть пары, с парами по времени. */
export function scheduleDays(main: MainSchedule): { key: WeekdayKey; lessons: Lesson[] }[] {
  return WEEKDAY_KEYS.filter((k) => (main.week[k] ?? []).length > 0).map((key) => ({
    key,
    lessons: [...main.week[key]!].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
  }));
}

/** «5 пар · 09:00–16:30» */
export function daySummary(lessons: Lesson[]): string {
  if (lessons.length === 0) return 'Пар нет';
  const start = lessons.reduce((m, l) => (toMinutes(l.start) < toMinutes(m) ? l.start : m), lessons[0].start);
  const end = lessons.reduce((m, l) => (toMinutes(l.end) > toMinutes(m) ? l.end : m), lessons[0].end);
  return `${lessonsCount(lessons.length)} · ${start}–${end}`;
}

/** Предметы, у которых кабинеты 1-й и 2-й подгруппы различаются (в порядке списка предметов). */
export function subjectsWithSubgroupRooms(main: MainSchedule): string[] {
  const ids = new Set<string>();
  for (const k of WEEKDAY_KEYS)
    for (const l of main.week[k] ?? []) if (lessonRoom(l, 1) !== lessonRoom(l, 2)) ids.add(l.subjectId);
  return main.subjects.map((s) => s.id).filter((id) => ids.has(id));
}

/**
 * Родительный падеж сокращения для фразы «у ИГ, Физры и Ин. яза».
 * Аббревиатуры, сокращения с точкой и с номером не склоняются. Если окончание непонятное — null.
 */
export function genitive(short: string): string | null {
  const s = short.trim();
  if (!s) return null;
  if (/[.\d]$/.test(s) || /\p{Lu}{2,}$/u.test(s)) return s; // Факульт., МДК 04.01, ИГ
  if (/ия$/.test(s)) return `${s.slice(0, -1)}и`; // История → Истории
  if (/ие$/.test(s)) return `${s.slice(0, -1)}я`; // Черчение → Черчения
  if (/[гкхжшщч]а$/.test(s)) return `${s.slice(0, -1)}и`; // Информатика → Информатики
  if (/а$/.test(s)) return `${s.slice(0, -1)}ы`; // Физра → Физры
  if (/я$/.test(s)) return `${s.slice(0, -1)}и`;
  if (/[бвгдзклмнпрстфхцчшщ]$/.test(s)) return `${s}а`; // Матвед → Матведа, Ин. яз → Ин. яза
  return null;
}

function joinRu(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`;
}

/** Подпись под настройкой «Подгруппа»: у каких предметов кабинеты различаются. */
export function subgroupRoomsNote(shorts: string[]): string {
  if (shorts.length === 0) return 'Сейчас кабинеты у подгрупп совпадают.';
  const gen = shorts.map(genitive);
  const text = gen.every((g): g is string => g !== null)
    ? `Кабинеты по подгруппам различаются у ${joinRu(gen)}`
    : `Кабинеты по подгруппам различаются: ${joinRu(shorts)}`;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * Время сборки по Москве: «9 октября 2026, 15:20».
 * Год не пишем, если он совпадает с текущим (как в iOS): «9 октября, 15:20».
 */
export function formatBuildTime(iso: string, currentYear?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const c = moscowClock(d);
  const hh = String(Math.floor(c.minutes / 60)).padStart(2, '0');
  const mm = String(c.minutes % 60).padStart(2, '0');
  const year = c.date.slice(0, 4);
  return `${formatDayMonth(c.date)}${year === currentYear ? '' : ` ${year}`}, ${hh}:${mm}`;
}

/** «Работа без интернета». */
export function offlineLabel(supported: boolean, controlled: boolean): string {
  if (!supported) return 'Не поддерживается браузером';
  return controlled ? 'Включена' : 'Включится после первой загрузки';
}

/** «Данные защищены от очистки»: true / false / null — неизвестно (или ещё проверяем: undefined). */
export function persistedLabel(value: boolean | null | undefined): string {
  if (value === undefined) return '…';
  if (value === null) return 'Неизвестно';
  return value ? 'Да' : 'Нет';
}
