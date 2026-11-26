// Главный блок экрана «Сегодня»: что происходит прямо сейчас.
// Пять состояний: идёт пара, перемена, до начала пар, пары закончились, выходной.

import { activeLessons, resolveDay, type ResolvedDay, type ResolvedLesson, type ScheduleSources, type SchedulePeriod } from './schedule';
import { addDays, toMinutes, weekdayIndex, WEEKDAY_KEYS, type Clock, type DateStr } from './time';
import { groupPairs, periodsOf, type Period } from './bells';
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
      period: Period;
      last: boolean;
      following?: { lesson: ResolvedLesson; period: Period };
      /** Сколько секунд до ближайшего звонка. */
      secondsLeft: number;
      /** Доля прошедшего времени урока, 0…1. */
      progress: number;
    }
  | { kind: 'break'; next: ResolvedLesson; period: Period; withinPair: boolean; secondsUntil: number; /** Длина перемены в секундах. */ breakSeconds: number }
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

const startSec = (l: { start: string }) => toMinutes(l.start) * 60;
const endSec = (l: { end: string }) => toMinutes(l.end) * 60;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Таймеры главного блока на другую секунду в пределах того же состояния.
 * Состояние экран пересчитывает раз в минуту (и точно на границе пары), а кольцо и цифры идут каждую секунду.
 */
export function tickHero<H extends HeroState>(hero: H, seconds: number): H {
  const h: HeroState = hero;
  switch (h.kind) {
    case 'lesson': {
      const start = startSec(h.period);
      const end = endSec(h.period);
      return { ...h, secondsLeft: Math.max(0, end - seconds), progress: clamp01((seconds - start) / (end - start)) } as H;
    }
    case 'break':
      return { ...h, secondsUntil: Math.max(0, startSec(h.period) - seconds) } as H;
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

  const pairs = groupPairs(active);
  const periods = pairs.flatMap((pair, pairIndex) =>
    pair.lessons.flatMap(lesson => periodsOf(lesson, pair.slot).map(period => ({ lesson, period, pairIndex }))),
  );
  // Конец урока не входит в его интервал. Ровно со звонка фокус переходит на следующий урок.
  const index = periods.findIndex(p => endSec(p.period) > now);
  const { lesson, period, pairIndex } = periods[index];
  const begins = startSec(period);
  const ends = endSec(period);
  const teaching = now >= begins;
  const progress: DayProgress = {
    index: now < startSec(active[0]) ? 0 : pairIndex + 1,
    total: pairs.length,
    remainingSeconds: lastEnd - now,
    segments: pairs.map(pair => clamp01((now - startSec(pair)) / (endSec(pair) - startSec(pair)))),
  };
  const upNext = active.find(l => startSec(l) >= endSec(lesson));
  if (teaching) {
    return {
      today, progress, upNext, changesAt: ends,
      hero: {
        kind: 'lesson', lesson, period, last: index === periods.length - 1, following: periods[index + 1],
        secondsLeft: ends - now, progress: (now - begins) / (ends - begins),
      },
    };
  }
  if (index === 0) {
    return { today, progress, upNext, changesAt: begins, hero: { kind: 'before', first: lesson, secondsUntil: begins - now } };
  }
  const previous = periods[index - 1];
  return {
    today, progress, upNext, changesAt: begins,
    hero: {
      kind: 'break', next: lesson, period, withinPair: previous.pairIndex === pairIndex,
      secondsUntil: begins - now, breakSeconds: begins - endSec(previous.period),
    },
  };
}
