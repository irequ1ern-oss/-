// Логика экрана «Сегодня» без интерфейса: карточка ближайшего праздника и причина, почему пар нет.

import { formatDayMonth, relativeDayName, weekdayName } from '../../core/format';
import { holidayOn, holidaySuggestions, isHolidayMark, type Holiday } from '../../core/holidays';
import type { ResolvedDay, ScheduleSources } from '../../core/schedule';
import type { DateStr } from '../../core/time';

/** На сколько дней вперёд «Сегодня» предлагает отметить праздник. */
export const HOLIDAY_CARD_DAYS = 14;

/**
 * Праздник для карточки «Отметить выходным?»: ближайший в ближайшие 14 дней, в который по расписанию есть пары,
 * ещё не отмечен «Пар нет весь день» и его не откладывали кнопкой «Не сейчас».
 */
export function upcomingHoliday(today: DateStr, src: ScheduleSources, dismissed: readonly DateStr[]): Holiday | null {
  return holidaySuggestions(today, src, HOLIDAY_CARD_DAYS).find((h) => !dismissed.includes(h.date)) ?? null;
}

/**
 * Дата праздника на карточке: «4 ноября, среда»; сегодня и завтра — «Сегодня, 4 ноября», «Завтра, 4 ноября»
 * (относительное слово только для них, как в подписи следующего дня в главном блоке).
 */
export function holidayDateLabel(date: DateStr, today: DateStr): string {
  const rel = relativeDayName(date, today);
  return rel && rel !== 'Послезавтра' ? `${rel}, ${formatDayMonth(date)}` : `${formatDayMonth(date)}, ${weekdayName(date)}`;
}

/** Почему отменены все пары дня: для главного блока «Пар нет». */
export interface CancelledDay {
  /** Причина: из «Пар нет весь день» или общая у всех отменённых пар; нет — «Все пары отменили». */
  note?: string;
  /** Отмечен государственный праздник (иконка — конфетти). */
  holiday: boolean;
}

export function cancelledDayInfo(day: ResolvedDay): CancelledDay {
  const dayOff = day.overrides.filter((o) => o.action === 'cancelDay').pop();
  if (dayOff) {
    const note = dayOff.note?.trim();
    if (note) return { note, holiday: isHolidayMark(dayOff) };
    // Выходной без причины в праздник — называем праздник.
    const h = holidayOn(day.date);
    return h ? { note: h.name, holiday: true } : { holiday: false };
  }
  // Пары отменяли по одной: если причина у всех одна («болеет преподаватель») — показываем её.
  const notes = new Set(day.lessons.map((l) => l.changeNote?.trim() ?? ''));
  const [only] = [...notes];
  return notes.size === 1 && only ? { note: only, holiday: false } : { holiday: false };
}
