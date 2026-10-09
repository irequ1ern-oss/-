// Работа с датами и временем. Всё считается по Москве, независимо от часового пояса устройства.
// Даты хранятся строками 'YYYY-MM-DD', время — 'HH:MM'.

export type DateStr = string;
export type TimeStr = string;

export const TIME_ZONE = 'Europe/Moscow';

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** Текущий момент глазами московских часов. */
export interface Clock {
  date: DateStr;
  /** Минуты от полуночи по Москве. */
  minutes: number;
  /** Секунды от полуночи по Москве (для таймеров с секундами). */
  seconds: number;
}

const moscowFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function moscowClock(instant: Date = new Date()): Clock {
  const parts: Record<string, string> = {};
  for (const p of moscowFormat.formatToParts(instant)) parts[p.type] = p.value;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes,
    seconds: minutes * 60 + Number(parts.second),
  };
}

/** Сдвиг часов на заданное число секунд (с переходом через полночь). */
export function shiftClock(clock: Clock, deltaSeconds: number): Clock {
  let seconds = clock.seconds + Math.floor(deltaSeconds);
  let date = clock.date;
  while (seconds >= 86_400) {
    seconds -= 86_400;
    date = addDays(date, 1);
  }
  while (seconds < 0) {
    seconds += 86_400;
    date = addDays(date, -1);
  }
  return { date, minutes: Math.floor(seconds / 60), seconds };
}

/** Часы со временем «как на стене»: удобно для тестов и тестового времени ?now=. */
export function clockAt(date: DateStr, time: string): Clock {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!m) throw new Error(`Неверное время: ${time}`);
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return { date, minutes, seconds: minutes * 60 + Number(m[3] ?? 0) };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDate(value: unknown): value is DateStr {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isValidTime(value: unknown): value is TimeStr {
  return typeof value === 'string' && TIME_RE.test(value);
}

function toUtcDate(date: DateStr): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Неверная дата: ${date}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function fromUtcDate(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: DateStr, days: number): DateStr {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

/** Сколько дней от a до b (b − a). */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / 86_400_000);
}

/** 0 — понедельник … 6 — воскресенье. */
export function weekdayIndex(date: DateStr): number {
  return (toUtcDate(date).getUTCDay() + 6) % 7;
}

export function weekdayKey(date: DateStr): WeekdayKey {
  return WEEKDAY_KEYS[weekdayIndex(date)];
}

/** Понедельник той недели, в которую попадает дата. */
export function startOfWeek(date: DateStr): DateStr {
  return addDays(date, -weekdayIndex(date));
}

export function toMinutes(time: TimeStr): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new Error(`Неверное время: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Разбирает тестовое время из адреса страницы, например `?now=2026-10-12T09:30`.
 * Нужно, чтобы посмотреть, как приложение выглядит в другой день и час.
 */
export function parseClockOverride(value: string | null): Clock | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::([0-5]\d))?)?$/.exec(value.trim());
  if (!m || !isValidDate(m[1])) return null;
  const time = m[2] ?? '08:00';
  if (!isValidTime(time)) return null;
  return clockAt(m[1], m[3] ? `${time}:${m[3]}` : time);
}
