// Статистика ДЗ для колец «Активности»: сделано за неделю, сделано вовремя, серия дней без просрочек.

import { addDays, diffDays, startOfWeek, type DateStr } from '../../core/time';
import type { HomeworkItem } from '../../shell/app';

/**
 * ДЗ с датой отметки. Дату знаем только для заданий, отмеченных в приложении;
 * если её нет, считаем, что задание сделано вовремя.
 */
export interface TrackedHomework extends HomeworkItem {
  doneAt?: DateStr;
}

export interface WeekStats {
  /** ДЗ со сроком на этой неделе (пн–вс). */
  total: number;
  /** Из них сделано. */
  done: number;
  /** Из них сделано не позже срока. */
  onTime: number;
}

/** Сделано не позже срока. */
export function doneOnTime(item: TrackedHomework): boolean {
  return item.done && (!item.doneAt || item.doneAt <= item.due);
}

/** Кольца: задания со сроком на текущей неделе (неделя — от понедельника, как в расписании). */
export function weekStats(items: TrackedHomework[], today: DateStr): WeekStats {
  const monday = startOfWeek(today);
  const sunday = addDays(monday, 6);
  const week = items.filter((h) => h.due >= monday && h.due <= sunday);
  return {
    total: week.length,
    done: week.filter((h) => h.done).length,
    onTime: week.filter(doneOnTime).length,
  };
}

/**
 * День D «с просрочкой», если к его началу было не сделано задание со сроком раньше D:
 * оно не сделано до сих пор или отмечено в день D или позже.
 */
export function dayHasOverdue(items: TrackedHomework[], day: DateStr): boolean {
  return items.some((h) => h.due < day && (!h.done || (h.doneAt !== undefined && h.doneAt >= day)));
}

/** Не больше года — дальше считать незачем. */
const STREAK_MAX = 365;

/**
 * Серия: сколько дней подряд, включая сегодня, не было просрочек.
 * Считаем назад от сегодня до первого «грязного» дня, но не раньше самого раннего срока среди ДЗ
 * (до него заданий не было). Если сегодня уже есть просрочка — серия 0.
 */
export function streakDays(items: TrackedHomework[], today: DateStr): number {
  if (items.length === 0) return 0;
  const first = items.reduce((min, h) => (h.due < min ? h.due : min), today);
  const span = Math.min(STREAK_MAX, diffDays(first, today) + 1);
  let n = 0;
  while (n < span && !dayHasOverdue(items, addDays(today, -n))) n++;
  return n;
}

/** Есть невыполненные ДЗ со сроком раньше сегодняшнего. */
export function hasOverdue(items: TrackedHomework[], today: DateStr): boolean {
  return items.some((h) => !h.done && h.due < today);
}
