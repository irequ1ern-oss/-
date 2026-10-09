// Русские подписи для дат и промежутков времени.

import { addDays, diffDays, weekdayIndex, type DateStr } from './time';

const WEEKDAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function parts(date: DateStr): { day: number; month: number } {
  return { day: Number(date.slice(8, 10)), month: Number(date.slice(5, 7)) };
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function weekdayName(date: DateStr): string {
  return WEEKDAYS[weekdayIndex(date)];
}

export function weekdayShort(date: DateStr): string {
  return WEEKDAYS_SHORT[weekdayIndex(date)];
}

/** «9 октября» */
export function formatDayMonth(date: DateStr): string {
  const { day, month } = parts(date);
  return `${day} ${MONTHS_GEN[month - 1]}`;
}

/** «пятница, 9 октября» */
export function formatDayLong(date: DateStr): string {
  return `${weekdayName(date)}, ${formatDayMonth(date)}`;
}

/** «09.10» */
export function formatDDMM(date: DateStr): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

/** «Сегодня», «Завтра», «Послезавтра» или null для остальных дней. */
export function relativeDayName(date: DateStr, today: DateStr): string | null {
  const d = diffDays(today, date);
  if (d === 0) return 'Сегодня';
  if (d === 1) return 'Завтра';
  if (d === 2) return 'Послезавтра';
  return null;
}

/** «12–16 октября» или «29 сентября – 3 октября» (пн–пт). */
export function formatWeekRange(monday: DateStr): string {
  const friday = addDays(monday, 4);
  const a = parts(monday);
  const b = parts(friday);
  if (a.month === b.month) return `${a.day}–${b.day} ${MONTHS_GEN[b.month - 1]}`;
  return `${formatDayMonth(monday)} – ${formatDayMonth(friday)}`;
}

/** «45 мин», «1 ч», «1 ч 20 мин» */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} ч ${rest} мин` : `${h} ч`;
}

/** Склонение: plural(5, 'день', 'дня', 'дней') → «дней». */
export function plural(n: number, one: string, few: string, many: string): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}
