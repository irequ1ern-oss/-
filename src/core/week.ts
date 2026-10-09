// Дни для экрана «Неделя».

import { resolveDay, type ResolvedDay, type ScheduleSources } from './schedule';
import { addDays, type DateStr } from './time';

/** Пн–Пт всегда; суббота и воскресенье — только если в них есть пары (например, из-за замены). */
export function weekDays(monday: DateStr, src: ScheduleSources): ResolvedDay[] {
  const days: ResolvedDay[] = [];
  for (let i = 0; i < 7; i++) {
    const day = resolveDay(addDays(monday, i), src);
    if (i < 5 || day.lessons.length > 0) days.push(day);
  }
  return days;
}
