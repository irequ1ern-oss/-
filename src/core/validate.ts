// Проверка data/schedule.json, чтобы опечатка в файле не сломала приложение незаметно.

import type { Lesson, MainSchedule, Week } from './schedule';
import { WEEKDAY_KEYS, isValidTime, toMinutes } from './time';

const DAY_NAMES: Record<string, string> = {
  mon: 'понедельник', tue: 'вторник', wed: 'среда', thu: 'четверг',
  fri: 'пятница', sat: 'суббота', sun: 'воскресенье',
};

/** Ошибки в неделе (пустой список — всё в порядке). */
export function validateWeek(week: Week, subjectIds: Set<string>): string[] {
  const errors: string[] = [];
  for (const [key, lessons] of Object.entries(week)) {
    const dayName = DAY_NAMES[key];
    if (!dayName) {
      errors.push(`Неизвестный день недели «${key}». Допустимо: ${WEEKDAY_KEYS.join(', ')}.`);
      continue;
    }
    if (!Array.isArray(lessons)) {
      errors.push(`${dayName}: ожидается список пар.`);
      continue;
    }
    let prev: Lesson | undefined;
    lessons.forEach((l, i) => {
      const where = `${dayName}, пара ${i + 1}`;
      if (!isValidTime(l.start) || !isValidTime(l.end)) {
        errors.push(`${where}: время должно быть в формате ЧЧ:ММ (сейчас «${l.start}»–«${l.end}»).`);
        return;
      }
      if (toMinutes(l.start) >= toMinutes(l.end)) errors.push(`${where}: начало ${l.start} не раньше конца ${l.end}.`);
      if (!subjectIds.has(l.subjectId)) errors.push(`${where}: неизвестный предмет «${l.subjectId}».`);
      if (l.rooms !== undefined && (!Array.isArray(l.rooms) || l.rooms.some((r) => typeof r !== 'string' || !r))) {
        errors.push(`${where}: rooms должен быть списком кабинетов по подгруппам, например ["27", "25"].`);
      }
      if (prev && isValidTime(prev.end) && toMinutes(l.start) < toMinutes(prev.end)) {
        errors.push(`${where}: начинается в ${l.start}, раньше конца предыдущей пары (${prev.end}).`);
      }
      prev = l;
    });
  }
  return errors;
}

export function validateMainSchedule(schedule: MainSchedule): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const s of schedule.subjects) {
    if (!s.id || !s.short || !s.full) errors.push(`Предмет ${JSON.stringify(s)}: нужны id, short и full.`);
    if (ids.has(s.id)) errors.push(`Предмет «${s.id}» указан дважды.`);
    ids.add(s.id);
  }
  return errors.concat(validateWeek(schedule.week, ids));
}
