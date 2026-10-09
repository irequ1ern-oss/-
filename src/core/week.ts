// Дни для экрана «Неделя».

import { activeLessons, resolveDay, type ResolvedDay, type ResolvedLesson, type ScheduleSources } from './schedule';
import { addDays, startOfWeek, toMinutes, weekdayIndex, type Clock, type DateStr } from './time';

/** Пн–Пт всегда; суббота и воскресенье — только если в них есть пары (например, из-за замены). */
export function weekDays(monday: DateStr, src: ScheduleSources): ResolvedDay[] {
  const days: ResolvedDay[] = [];
  for (let i = 0; i < 7; i++) {
    const day = resolveDay(addDays(monday, i), src);
    if (i < 5 || day.lessons.length > 0) days.push(day);
  }
  return days;
}

/** День, который открыт на «Неделе» по умолчанию: сегодня, а в выходной без пар — понедельник. */
export function defaultStripDay(today: DateStr, src: ScheduleSources): DateStr {
  const days = weekDays(startOfWeek(today), src).map((d) => d.date);
  if (days.includes(today)) return today;
  return weekdayIndex(today) >= 5 ? weekDays(addDays(startOfWeek(today), 7), src)[0].date : days[0];
}

/** Соседний день в полосе дней. На краю недели переходит на соседнюю неделю. */
export function shiftStripDay(date: DateStr, dir: 1 | -1, src: ScheduleSources): DateStr {
  const monday = startOfWeek(date);
  const days = weekDays(monday, src).map((d) => d.date);
  const i = days.indexOf(date);
  const j = i === -1 ? (dir > 0 ? days.length : -1) : i + dir;
  if (j >= 0 && j < days.length) return days[j];
  const other = weekDays(addDays(monday, dir * 7), src).map((d) => d.date);
  return dir > 0 ? other[0] : other[other.length - 1];
}

/** Ближайшие пары предмета на `days` дней вперёд, начиная с сегодняшних, которые ещё не закончились. */
export function upcomingLessonsOfSubject(subjectId: string, clock: Clock, src: ScheduleSources, days = 7): ResolvedLesson[] {
  const result: ResolvedLesson[] = [];
  for (let i = 0; i < days; i++) {
    const day = resolveDay(addDays(clock.date, i), src);
    for (const l of activeLessons(day)) {
      if (l.subjectId !== subjectId) continue;
      if (i === 0 && toMinutes(l.end) <= clock.minutes) continue;
      result.push(l);
    }
  }
  return result;
}
