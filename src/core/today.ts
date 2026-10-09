// Что показывать на экране «Сегодня»: текущая пара, следующая, перемена,
// а после последней пары — ближайший учебный день.

import { activeLessons, resolveDay, type ResolvedDay, type ResolvedLesson, type ScheduleSources } from './schedule';
import { addDays, toMinutes, type Clock } from './time';

export type LessonPhase = 'past' | 'current' | 'upcoming';

export interface TodayView {
  /** День, который показываем: сегодня или ближайший учебный. */
  day: ResolvedDay;
  /** Расписание на сегодня (нужно для подписей, даже если показываем другой день). */
  today: ResolvedDay;
  isToday: boolean;
  /** Через сколько дней показываемый день (0 — сегодня). */
  daysAhead: number;
  /** Почему показываем не сегодня. */
  reason?: 'finished' | 'cancelled' | 'free';
  current?: { lesson: ResolvedLesson; minutesLeft: number; progress: number };
  next?: { lesson: ResolvedLesson; minutesUntil: number };
  /** Сейчас перемена между парами. */
  inBreak: boolean;
  /** Пар не нашлось на много дней вперёд. */
  nothingAhead: boolean;
}

/** Сколько дней вперёд искать ближайший учебный день (с запасом на летние каникулы). */
export const SEARCH_DAYS = 120;

export function lessonPhase(lesson: ResolvedLesson, clock: Clock): LessonPhase {
  if (lesson.date < clock.date) return 'past';
  if (lesson.date > clock.date) return 'upcoming';
  if (toMinutes(lesson.end) <= clock.minutes) return 'past';
  if (toMinutes(lesson.start) <= clock.minutes) return 'current';
  return 'upcoming';
}

export function computeTodayView(clock: Clock, src: ScheduleSources): TodayView {
  const today = resolveDay(clock.date, src);
  const active = activeLessons(today);
  const lastEnd = Math.max(-1, ...active.map((l) => toMinutes(l.end)));

  if (clock.minutes < lastEnd) {
    const currentLesson = active.find((l) => lessonPhase(l, clock) === 'current');
    const nextLesson = active.find((l) => toMinutes(l.start) > clock.minutes && l !== currentLesson);
    const current = currentLesson && {
      lesson: currentLesson,
      minutesLeft: toMinutes(currentLesson.end) - clock.minutes,
      progress:
        (clock.minutes - toMinutes(currentLesson.start)) /
        Math.max(1, toMinutes(currentLesson.end) - toMinutes(currentLesson.start)),
    };
    const next = nextLesson && { lesson: nextLesson, minutesUntil: toMinutes(nextLesson.start) - clock.minutes };
    const startedAny = active.some((l) => toMinutes(l.start) <= clock.minutes);
    return {
      day: today,
      today,
      isToday: true,
      daysAhead: 0,
      current,
      next,
      inBreak: !current && startedAny && Boolean(next),
      nothingAhead: false,
    };
  }

  const reason: TodayView['reason'] =
    active.length > 0 ? 'finished' : today.lessons.length > 0 ? 'cancelled' : 'free';

  for (let i = 1; i <= SEARCH_DAYS; i++) {
    const day = resolveDay(addDays(clock.date, i), src);
    if (activeLessons(day).length > 0) {
      return { day, today, isToday: false, daysAhead: i, reason, inBreak: false, nothingAhead: false };
    }
  }
  return { day: today, today, isToday: true, daysAhead: 0, reason, inBreak: false, nothingAhead: true };
}
