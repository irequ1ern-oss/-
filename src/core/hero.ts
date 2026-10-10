// Главный блок экрана «Сегодня»: что происходит прямо сейчас.
// Пять состояний: идёт пара, перемена, до начала пар, пары закончились, выходной.

import { activeLessons, resolveDay, type ResolvedDay, type ResolvedLesson, type ScheduleSources, type SchedulePeriod } from './schedule';
import { addDays, toMinutes, weekdayIndex, WEEKDAY_KEYS, type Clock, type DateStr } from './time';
import { SEARCH_DAYS } from './today';

export interface NextStudyDay {
  day: ResolvedDay;
  first: ResolvedLesson;
  /** Через сколько дней (1 — завтра). */
  daysAhead: number;
}

export type DayOffReason = 'weekend' | 'holiday' | 'cancelled' | 'free';

export type HeroState =
  | {
      kind: 'lesson';
      lesson: ResolvedLesson;
      /** Сколько секунд до конца пары. */
      secondsLeft: number;
      /** Доля прошедшего времени пары, 0…1. */
      progress: number;
    }
  | { kind: 'break'; next: ResolvedLesson; secondsUntil: number; /** Длина перемены в секундах. */ breakSeconds: number }
  | { kind: 'before'; first: ResolvedLesson; secondsUntil: number }
  | { kind: 'after'; next: NextStudyDay | null }
  | { kind: 'dayoff'; reason: DayOffReason; period?: SchedulePeriod; next: NextStudyDay | null };

export interface DayProgress {
  /** Номер текущей (или следующей) пары, начиная с 1; 0 — пары ещё не начались. */
  index: number;
  total: number;
  /** Сколько секунд до конца последней пары. */
  remainingSeconds: number;
  /** Заполненность сегмента каждой пары: 1 — прошла, 0 — впереди. */
  segments: number[];
}

export interface TodayHero {
  today: ResolvedDay;
  hero: HeroState;
  /** Прогресс дня — только пока учёба сегодня не закончилась. */
  progress?: DayProgress;
  /** Блок «Далее»: следующая пара после той, что в главном блоке. */
  upNext?: ResolvedLesson;
  /**
   * Когда (секунды от полуночи) сменится состояние: конец текущей пары или начало следующей.
   * Нет — до конца дня ничего не изменится (после пар, выходной).
   */
  changesAt?: number;
}

/**
 * Ближайший учебный день зависит только от даты, а поиск перебирает до SEARCH_DAYS дней —
 * поэтому запоминаем ответ для пары «расписание + дата». Источники расписания не меняются
 * на месте (при изменении создаётся новый объект), так что запомненное не устаревает.
 */
const nextDayCache = new WeakMap<ScheduleSources, Map<DateStr, NextStudyDay | null>>();

function findNextStudyDay(date: DateStr, src: ScheduleSources): NextStudyDay | null {
  let byDate = nextDayCache.get(src);
  if (!byDate) nextDayCache.set(src, (byDate = new Map()));
  const cached = byDate.get(date);
  if (cached !== undefined) return cached;
  let found: NextStudyDay | null = null;
  for (let i = 1; i <= SEARCH_DAYS && !found; i++) {
    const day = resolveDay(addDays(date, i), src);
    const first = activeLessons(day)[0];
    if (first) found = { day, first, daysAhead: i };
  }
  byDate.set(date, found);
  return found;
}

/** Каникулы — временное расписание, в котором нет ни одной пары. В обычном временном расписании пустой день — выходной. */
function isHolidayPeriod(period: SchedulePeriod): boolean {
  return WEEKDAY_KEYS.every((k) => !period.week[k]?.length);
}

const startSec = (l: ResolvedLesson) => toMinutes(l.start) * 60;
const endSec = (l: ResolvedLesson) => toMinutes(l.end) * 60;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Таймеры главного блока на другую секунду в пределах того же состояния.
 * Состояние экран пересчитывает раз в минуту (и точно на границе пары), а кольцо и цифры идут каждую секунду.
 */
export function tickHero<H extends HeroState>(hero: H, seconds: number): H {
  const h: HeroState = hero;
  switch (h.kind) {
    case 'lesson': {
      const start = startSec(h.lesson);
      const end = endSec(h.lesson);
      return { ...h, secondsLeft: Math.max(0, end - seconds), progress: clamp01((seconds - start) / (end - start)) } as H;
    }
    case 'break':
      return { ...h, secondsUntil: Math.max(0, startSec(h.next) - seconds) } as H;
    case 'before':
      return { ...h, secondsUntil: Math.max(0, startSec(h.first) - seconds) } as H;
    default:
      return hero;
  }
}

export function computeHero(clock: Clock, src: ScheduleSources): TodayHero {
  const today = resolveDay(clock.date, src);
  const active = activeLessons(today);
  const now = clock.seconds;
  const lastEnd = active.length ? Math.max(...active.map(endSec)) : -1;

  if (active.length === 0) {
    const reason: DayOffReason =
      today.lessons.length > 0
        ? 'cancelled'
        : today.period && isHolidayPeriod(today.period)
          ? 'holiday'
          : weekdayIndex(clock.date) >= 5
            ? 'weekend'
            : 'free';
    return { today, hero: { kind: 'dayoff', reason, period: today.period, next: findNextStudyDay(clock.date, src) } };
  }

  if (now >= lastEnd) {
    return { today, hero: { kind: 'after', next: findNextStudyDay(clock.date, src) } };
  }

  const segments = active.map((l) => {
    if (now >= endSec(l)) return 1;
    if (now <= startSec(l)) return 0;
    return (now - startSec(l)) / (endSec(l) - startSec(l));
  });
  const currentIdx = active.findIndex((l) => now >= startSec(l) && now < endSec(l));
  const nextIdx = active.findIndex((l) => startSec(l) > now);
  const focusIdx = currentIdx !== -1 ? currentIdx : nextIdx;
  const progress: DayProgress = {
    index: currentIdx !== -1 || now >= startSec(active[0]) ? focusIdx + 1 : 0,
    total: active.length,
    remainingSeconds: lastEnd - now,
    segments,
  };
  const upNext = active.slice(focusIdx + 1).find((l) => startSec(l) >= endSec(active[focusIdx]));
  const changesAt = Math.min(...active.flatMap((l) => [startSec(l), endSec(l)]).filter((s) => s > now));

  if (currentIdx !== -1) {
    const lesson = active[currentIdx];
    return {
      today,
      progress,
      upNext,
      changesAt,
      hero: { kind: 'lesson', lesson, secondsLeft: endSec(lesson) - now, progress: segments[currentIdx] },
    };
  }

  const next = active[nextIdx];
  if (nextIdx === 0) {
    return { today, progress, upNext, changesAt, hero: { kind: 'before', first: next, secondsUntil: startSec(next) - now } };
  }
  const prevEnd = Math.max(...active.slice(0, nextIdx).map(endSec));
  return {
    today,
    progress,
    upNext,
    changesAt,
    hero: { kind: 'break', next, secondsUntil: startSec(next) - now, breakSeconds: startSec(next) - prevEnd },
  };
}
