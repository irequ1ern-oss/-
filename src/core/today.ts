// Фаза пары относительно текущего времени (прошла / идёт / впереди) и граница поиска учебных дней.
// Главный блок «Сегодня» считает hero.ts.

import type { ResolvedLesson } from './schedule';
import { toMinutes, type Clock } from './time';

export type LessonPhase = 'past' | 'current' | 'upcoming';

/** Сколько дней вперёд искать ближайший учебный день (с запасом на летние каникулы). */
export const SEARCH_DAYS = 120;

export function lessonPhase(lesson: ResolvedLesson, clock: Clock): LessonPhase {
  if (lesson.date < clock.date) return 'past';
  if (lesson.date > clock.date) return 'upcoming';
  if (toMinutes(lesson.end) <= clock.minutes) return 'past';
  if (toMinutes(lesson.start) <= clock.minutes) return 'current';
  return 'upcoming';
}
