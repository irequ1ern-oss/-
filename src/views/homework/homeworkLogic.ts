// Логика списка ДЗ без интерфейса: группы по сроку, подписи сроков, изменения списка, «Ближайшее».

import { plural, weekdayShort } from '../../core/format';
import { findNextLessonOfSubject, type ScheduleSources } from '../../core/schedule';
import { addDays, diffDays, startOfWeek, type DateStr } from '../../core/time';
import type { EventItem } from '../../shell/app';
import type { TrackedHomework } from './stats';

export type HomeworkGroupId = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

export interface HomeworkGroup {
  id: HomeworkGroupId;
  title: string;
  items: TrackedHomework[];
}

const GROUP_TITLES: Record<HomeworkGroupId, string> = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  week: 'На этой неделе',
  later: 'Позже',
};

const GROUP_ORDER: HomeworkGroupId[] = ['overdue', 'today', 'tomorrow', 'week', 'later'];

/** В какую группу попадает невыполненное ДЗ. «На этой неделе» — до воскресенья включительно. */
export function groupOf(due: DateStr, today: DateStr): HomeworkGroupId {
  const d = diffDays(today, due);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  return due <= addDays(startOfWeek(today), 6) ? 'week' : 'later';
}

/** Сначала ранний срок; при одинаковом сроке — в исходном порядке. */
function byDue<T extends { due: DateStr }>(items: T[]): T[] {
  return items.map((h, i) => ({ h, i })).sort((a, b) => (a.h.due < b.h.due ? -1 : a.h.due > b.h.due ? 1 : a.i - b.i)).map((x) => x.h);
}

/**
 * Невыполненные ДЗ по группам (пустые группы не возвращаются) и отдельно выполненные —
 * самые свежие сверху.
 */
export function groupHomework(items: TrackedHomework[], today: DateStr): { groups: HomeworkGroup[]; done: TrackedHomework[] } {
  const buckets = new Map<HomeworkGroupId, TrackedHomework[]>();
  for (const h of byDue(items.filter((x) => !x.done))) {
    const id = groupOf(h.due, today);
    buckets.set(id, [...(buckets.get(id) ?? []), h]);
  }
  const groups = GROUP_ORDER.filter((id) => buckets.has(id)).map((id) => ({ id, title: GROUP_TITLES[id], items: buckets.get(id)! }));
  const done = byDue(items.filter((x) => x.done)).reverse();
  return { groups, done };
}

const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

/** «пт, 16 окт.» */
export function formatShortDate(date: DateStr): string {
  return `${weekdayShort(date).toLowerCase()}, ${Number(date.slice(8, 10))} ${MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}`;
}

/**
 * Подпись срока: «сегодня», «завтра», «вчера», «просрочено на 3 дн.» или «пт, 16 окт.».
 * Для выполненных ДЗ просрочку не пишем — только дату.
 */
export function dueLabel(due: DateStr, today: DateStr, done = false): string {
  const d = diffDays(today, due);
  if (d === 0) return 'сегодня';
  if (d === 1) return 'завтра';
  if (d === -1) return 'вчера';
  if (d < -1 && !done) return `просрочено на ${-d} дн.`;
  return formatShortDate(due);
}

export function isOverdue(item: TrackedHomework, today: DateStr): boolean {
  return !item.done && item.due < today;
}

// ---------- Изменения списка (возвращают новый массив) ----------

/** Отметить / снять отметку. Дата отметки нужна для «вовремя» и серии. */
export function setDone(items: TrackedHomework[], id: string, done: boolean, today: DateStr): TrackedHomework[] {
  return items.map((h) => {
    if (h.id !== id) return h;
    const next: TrackedHomework = { ...h, done };
    if (done) next.doneAt = today;
    else delete next.doneAt;
    return next;
  });
}

/**
 * Новый срок для «Перенести»: ДЗ к паре, поэтому — следующая пара этого предмета после прежнего срока,
 * а у просроченного — после сегодняшнего дня (иначе оно так и осталось бы просроченным).
 * Если пар предмета впереди нет — следующий день.
 */
export function postponedDue(item: Pick<TrackedHomework, 'subjectId' | 'due'>, today: DateStr, src: ScheduleSources): DateStr {
  const from = item.due > today ? item.due : today;
  return findNextLessonOfSubject(item.subjectId, from, src)?.date ?? addDays(from, 1);
}

/** Поставить новый срок (см. postponedDue). */
export function postpone(items: TrackedHomework[], id: string, due: DateStr): TrackedHomework[] {
  return items.map((h) => (h.id === id ? { ...h, due } : h));
}

/** Удалить; возвращает и само ДЗ с местом в списке — чтобы можно было «Отменить». */
export function removeHomework(items: TrackedHomework[], id: string): { items: TrackedHomework[]; removed?: { item: TrackedHomework; index: number } } {
  const index = items.findIndex((h) => h.id === id);
  if (index < 0) return { items };
  return { items: items.filter((h) => h.id !== id), removed: { item: items[index], index } };
}

/** Вернуть удалённое ДЗ на прежнее место (если его ещё нет в списке). */
export function restoreHomework(items: TrackedHomework[], item: TrackedHomework, index: number): TrackedHomework[] {
  if (items.some((h) => h.id === item.id)) return items;
  const at = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/** Заменить одно ДЗ его прежней версией (отмена отметки или переноса). */
export function replaceHomework(items: TrackedHomework[], item: TrackedHomework): TrackedHomework[] {
  return items.map((h) => (h.id === item.id ? item : h));
}

/** Уведомление после переноса: «Срок перенесён на завтра» / «…на сегодня» / «…на пт, 16 окт.». */
export function postponeToastText(newDue: DateStr, today: DateStr): string {
  const d = diffDays(today, newDue);
  const when = d === 0 ? 'сегодня' : d === 1 ? 'завтра' : formatShortDate(newDue);
  return `Срок перенесён на ${when}`;
}

/** Строка под кольцами. Без «ты сделал(а)» — нейтрально. */
export function streakText(days: number, overdue: boolean): string {
  if (days > 0) return `Серия: ${days} ${plural(days, 'день', 'дня', 'дней')} без просрочек`;
  return overdue ? 'Серия прервана: есть просроченные ДЗ' : 'Серия начнётся снова завтра';
}

// ---------- Колонка «Ближайшее» ----------

/** Невыполненные ДЗ со сроком не позже чем через `days` дней; просроченные — первыми. */
export function upcomingHomework(items: TrackedHomework[], today: DateStr, days = 7): TrackedHomework[] {
  const last = addDays(today, days);
  return byDue(items.filter((h) => !h.done && h.due <= last));
}

/** События с сегодняшнего дня на `days` дней вперёд, по дате. */
export function upcomingEvents(events: EventItem[], today: DateStr, days = 14): EventItem[] {
  const last = addDays(today, days);
  return events
    .filter((e) => e.date >= today && e.date <= last)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : a.i - b.i))
    .map((x) => x.e);
}

/** Подпись даты события: «сегодня», «завтра», «послезавтра», «пт, 16 окт.». */
export function eventDateLabel(date: DateStr, today: DateStr): string {
  const d = diffDays(today, date);
  if (d === 0) return 'сегодня';
  if (d === 1) return 'завтра';
  if (d === 2) return 'послезавтра';
  return formatShortDate(date);
}
