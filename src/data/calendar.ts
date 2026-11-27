import { isValidDate, weekdayKey } from '../core/time';
import { validateWeek } from '../core/validate';
import type { Lesson, MainSchedule, SchedulePeriod } from '../core/schedule';

export function calendarPeriods(
  raw: unknown,
  main: MainSchedule,
): SchedulePeriod[] {
  if (!Array.isArray(raw) || raw.length > 8000)
    throw Error('Неверный календарь');
  const ids = new Set(main.subjects.map((s) => s.id));
  return raw.map((r) => {
    if (
      !r ||
      !isValidDate(r.date) ||
      !Array.isArray(r.lessons) ||
      r.lessons.some((l: unknown) => !l || typeof l !== 'object')
    )
      throw Error('Неверная дата или уроки');
    const week = { [weekdayKey(r.date)]: r.lessons as Lesson[] };
    if (validateWeek(week, ids).length) throw Error('Неверное расписание');
    return {
      id: r.date,
      title: 'Расписание на дату',
      from: r.date,
      to: r.date,
      week,
      createdAt: r.date,
      updatedAt: r.date,
    };
  });
}
export function watchCalendar(
  url: string,
  main: MainSchedule,
  apply: (p: SchedulePeriod[]) => void,
) {
  const cache = 'ucheba.calendar:' + url;
  try {
    const raw = localStorage.getItem(cache);
    if (raw) apply(calendarPeriods(JSON.parse(raw), main));
  } catch {
    /* First run or unavailable cache. */
  }
  let pending = false;
  async function refresh() {
    if (pending) return;
    pending = true;
    try {
      const res = await fetch(url, {
        credentials: 'omit',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const raw = await res.json();
      const periods = calendarPeriods(raw, main);
      apply(periods);
      try {
        localStorage.setItem(cache, JSON.stringify(raw));
      } catch {
        /* Memory copy remains valid. */
      }
    } catch {
      /* Offline: use the last validated public schedule. */
    } finally {
      pending = false;
    }
  }
  void refresh();
  window.addEventListener('online', refresh);
  window.addEventListener('public-catalog-updated', refresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
}

export function watchSubjects(
  calendar: string,
  main: MainSchedule,
  apply: (subjects: MainSchedule['subjects']) => void,
) {
  const url = new URL(calendar, location.href);
  url.pathname = url.pathname.replace(/\/calendar$/, '/catalog');
  const key = 'ucheba.catalog:' + url.href;
  function validate(data: unknown) {
    if (
      !Array.isArray(data) ||
      data.length > 1000 ||
      !main.subjects.every((s) => data.some((i) => i?.id === s.id)) ||
      data.some(
        (s) =>
          !s ||
          typeof s.id !== 'string' ||
          typeof s.full !== 'string' ||
          typeof s.short !== 'string',
      )
    )
      throw Error('Неверный каталог');
    return data as MainSchedule['subjects'];
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw) apply(validate(JSON.parse(raw)));
  } catch {
    /* Use bundled subjects. */
  }
  async function load() {
    try {
      const res = await fetch(url, {
        credentials: 'omit',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const data = validate(await res.json());
      apply(data);
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        /* Storage full. */
      }
    } catch {
      /* Offline. */
    }
  }
  void load();
  window.addEventListener('online', load);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void load();
  });
}
