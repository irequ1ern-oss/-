// Логика экрана «Неделя» без интерфейса: подписи, отметки под днями, листание недель, решение по свайпу.

import { activeLessons, dayHasChanges, type ResolvedDay, type ScheduleSources } from '../../core/schedule';
import { weekDays } from '../../core/week';
import { capitalize, formatDayLong, formatDayMonth, lessonsCount, plural } from '../../core/format';
import { addDays, diffDays, startOfWeek, weekdayIndex, type DateStr } from '../../core/time';
import type { HomeworkItem } from '../../shell/app';

/** На сколько недель неделя даты отстоит от текущей (0 — эта, 1 — следующая, −1 — прошлая). */
export function weekOffset(today: DateStr, date: DateStr): number {
  return Math.round(diffDays(startOfWeek(today), startOfWeek(date)) / 7);
}

/** Подпись над заголовком: «Эта неделя», «Через 2 недели», «5 недель назад». */
export function weekCaption(offset: number): string {
  if (offset === 0) return 'Эта неделя';
  if (offset === 1) return 'Следующая неделя';
  if (offset === -1) return 'Прошлая неделя';
  const n = Math.abs(offset);
  const weeks = `${n} ${plural(n, 'неделю', 'недели', 'недель')}`;
  return offset > 0 ? `Через ${weeks}` : `${capitalize(weeks)} назад`;
}

/**
 * Промежуток дат в том же виде, что formatWeekRange: «12–16 октября», «29 сентября – 3 октября».
 * Заголовок «Недели» строим по дням, которые видны в полосе: с субботой — «12–17 октября».
 */
export function formatDayRange(first: DateStr, last: DateStr): string {
  if (first === last) return formatDayMonth(first);
  if (first.slice(0, 7) === last.slice(0, 7)) return `${Number(first.slice(8, 10))}–${formatDayMonth(last)}`;
  return `${formatDayMonth(first)} – ${formatDayMonth(last)}`;
}

/** Заголовок недели: от первого до последнего дня полосы. */
export function weekTitle(days: ResolvedDay[]): string {
  return formatDayRange(days[0].date, days[days.length - 1].date);
}

/**
 * Заголовок над парами дня: «Четверг, 15 октября», а сегодня — «Сегодня, 12 октября»
 * (день недели уже виден в полосе, а метка «сегодня» рядом с длинной датой не помещается на 360 px).
 */
export function dayTitle(date: DateStr, today: DateStr): string {
  return date === today ? `Сегодня, ${formatDayMonth(date)}` : capitalize(formatDayLong(date));
}

/** Точки под днём: изменения в расписании и невыполненные ДЗ со сроком в этот день. */
export interface DayMarks {
  changes: boolean;
  homework: number;
}

export function dayMarks(day: ResolvedDay, homework: HomeworkItem[]): DayMarks {
  return {
    changes: dayHasChanges(day),
    homework: homework.filter((h) => !h.done && h.due === day.date).length,
  };
}

/** Подпись дня для экранного диктора: «Четверг, 15 октября, 5 пар, есть изменения». */
export function dayPillLabel(day: ResolvedDay, today: DateStr, marks: DayMarks): string {
  const count = activeLessons(day).length;
  const parts = [capitalize(formatDayLong(day.date))];
  if (day.date === today) parts.push('сегодня');
  parts.push(count > 0 ? lessonsCount(count) : day.lessons.length > 0 ? 'пары отменены' : 'пар нет');
  if (marks.changes) parts.push('есть изменения');
  if (marks.homework > 0) parts.push(`ДЗ: ${marks.homework}`);
  return parts.join(', ');
}

/**
 * Тот же день недели через `weeks` недель (кнопки ‹ ›).
 * Если такого дня в той неделе нет (суббота без пар) — ближайший более ранний.
 */
export function sameWeekdayIn(date: DateStr, weeks: number, src: ScheduleSources): DateStr {
  const days = weekDays(addDays(startOfWeek(date), weeks * 7), src).map((d) => d.date);
  const wd = weekdayIndex(date);
  const earlier = days.filter((d) => weekdayIndex(d) <= wd);
  return earlier.length ? earlier[earlier.length - 1] : days[0];
}

/** Направление перехода между днями: 1 — вперёд (новый день въезжает справа), −1 — назад. */
export function directionTo(from: DateStr, to: DateStr): 1 | -1 {
  return to > from ? 1 : -1;
}

/** Порог свайпа: доля ширины и скорость «броска» (px/мс). */
export const SWIPE_DISTANCE = 0.25;
export const SWIPE_VELOCITY = 0.35;

/**
 * Чем закончился горизонтальный свайп: 1 — следующий день, −1 — предыдущий, 0 — вернуть на место.
 * Быстрый бросок решает по направлению скорости, медленное ведение — по пройденному расстоянию.
 * dx < 0 (палец ушёл влево) — следующий день.
 */
export function swipeOutcome(dx: number, velocity: number, width: number): -1 | 0 | 1 {
  if (Math.abs(dx) < 8) return 0;
  const dir = dx < 0 ? 1 : -1;
  if (Math.abs(velocity) > SWIPE_VELOCITY) {
    return Math.sign(velocity) === Math.sign(dx) && Math.abs(dx) > 24 ? dir : 0;
  }
  return Math.abs(dx) > width * SWIPE_DISTANCE ? dir : 0;
}
