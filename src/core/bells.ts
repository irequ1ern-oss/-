import bellGrid from '../../data/bells.json';
// Звонки группы 218. Строки расписания могут занимать целую пару или один её урок.
import type { Lesson } from './schedule';

interface BellPair {
  number: number;
  start: string;
  pause: string;
  resume: string;
  end: string;
}

export const BELL_PAIRS: readonly BellPair[] = bellGrid;

export function bellPair({ start, end }: Pick<Lesson, 'start' | 'end'>) {
  return BELL_PAIRS.find(p =>
    (start === p.start && (end === p.pause || end === p.end)) ||
    (start === p.resume && end === p.end),
  );
}

export interface Pair<T extends Lesson> {
  slot?: BellPair;
  start: string;
  end: string;
  lessons: T[];
}

/** Разные предметы в одном стандартном слоте остаются одной парой. Особые интервалы сохраняют свои границы. */
export function groupPairs<T extends Lesson>(lessons: readonly T[]): Pair<T>[] {
  const pairs: Pair<T>[] = [];
  for (const lesson of lessons) {
    const slot = bellPair(lesson);
    const last = pairs[pairs.length - 1];
    if (slot && last?.slot === slot) {
      last.lessons.push(lesson);
      if (lesson.end > last.end) last.end = lesson.end;
    } else {
      pairs.push({ slot, start: lesson.start, end: lesson.end, lessons: [lesson] });
    }
  }
  return pairs;
}

export interface Period {
  start: string;
  end: string;
  half?: 1 | 2;
}

export function periodsOf(lesson: Lesson, slot = bellPair(lesson)): Period[] {
  if (!slot) return [{ start: lesson.start, end: lesson.end }];
  const periods: Period[] = [];
  if (lesson.start === slot.start) periods.push({ start: slot.start, end: slot.pause, half: 1 });
  if (lesson.end === slot.end) periods.push({ start: slot.resume, end: slot.end, half: 2 });
  return periods;
}
