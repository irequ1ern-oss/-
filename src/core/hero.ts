// Главный блок экрана «Сегодня»: что происходит прямо сейчас.
// Пять состояний: идёт пара, перемена, до начала пар, пары закончились, выходной.

import { activeLessons, resolveDay, type ResolvedDay, type ResolvedLesson, type ScheduleSources, type SchedulePeriod } from './schedule';
import { addDays, toMinutes, weekdayIndex, type Clock } from './time';
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
}

function findNextStudyDay(clock: Clock, src: ScheduleSources): NextStudyDay | null {
  for (let i = 1; i <= SEARCH_DAYS; i++) {
    const day = resolveDay(addDays(clock.date, i), src);
    const first = activeLessons(day)[0];
    if (first) return { day, first, daysAhead: i };
  }
  return null;
}

const startSec = (l: ResolvedLesson) => toMinutes(l.start) * 60;
const endSec = (l: ResolvedLesson) => toMinutes(l.end) * 60;

export function computeHero(clock: Clock, src: ScheduleSources): TodayHero {
  const today = resolveDay(clock.date, src);
  const active = activeLessons(today);
  const now = clock.seconds;
  const lastEnd = active.length ? Math.max(...active.map(endSec)) : -1;

  if (active.length === 0) {
    const reason: DayOffReason =
      today.lessons.length > 0 ? 'cancelled' : today.period ? 'holiday' : weekdayIndex(clock.date) >= 5 ? 'weekend' : 'free';
    return { today, hero: { kind: 'dayoff', reason, period: today.period, next: findNextStudyDay(clock, src) } };
  }

  if (now >= lastEnd) {
    return { today, hero: { kind: 'after', next: findNextStudyDay(clock, src) } };
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

  if (currentIdx !== -1) {
    const lesson = active[currentIdx];
    return {
      today,
      progress,
      upNext,
      hero: { kind: 'lesson', lesson, secondsLeft: endSec(lesson) - now, progress: segments[currentIdx] },
    };
  }

  const next = active[nextIdx];
  if (nextIdx === 0) {
    return { today, progress, upNext, hero: { kind: 'before', first: next, secondsUntil: startSec(next) - now } };
  }
  const prevEnd = Math.max(...active.slice(0, nextIdx).map(endSec));
  return {
    today,
    progress,
    upNext,
    hero: { kind: 'break', next, secondsUntil: startSec(next) - now, breakSeconds: startSec(next) - prevEnd },
  };
}
