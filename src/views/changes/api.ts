// Действия с изменениями расписания, которые вызывают другие экраны («Сегодня», «Неделя», меню пары, «+»).
// Сигнатуры менять нельзя — на них опираются другие экраны. Сами шторки и экраны — в соседних файлах.

import type { ResolvedLesson, ScheduleSources } from '../../core/schedule';
import type { DateStr } from '../../core/time';
import { mainSchedule } from '../../data/schedule';
import { getChanges, newStamp, type Undo } from '../../state/changes';
import { withUserSubjects } from '../../state/subjects';
import { showToast } from '../../ui/overlays';
import { openChangeChooser } from './Chooser';
import { openDaySheet } from './DayEditor';
import { openLessonSheet } from './LessonEditor';
import { findTraced, planRevert, planToggleCancel, traceDay } from './logic';
import { applyPlan, notifyChange as notify } from './notify';

/**
 * Расписание с изменениями прямо из хранилища — для действий без экрана (пункт меню пары).
 * Так же его собирает AppRoot: основное расписание + свои предметы + временные расписания и изменения.
 */
export function currentSources(): ScheduleSources {
  const { periods, overrides, subjects } = getChanges();
  return { main: withUserSubjects(mainSchedule, subjects), periods, overrides };
}

/** Уведомление внизу с кнопкой «Отменить». */
export function notifyChange(text: string, undo: Undo): void {
  notify(text, undo);
}

/** Шторка с правкой дня (заголовок — «Чт, 15 октября»). */
export function openDayEditor(date: DateStr): void {
  openDaySheet(date);
}

/** Шторка «Заменить пару» (с lesson) или «Добавить пару» (без). */
export function openLessonEditor(opts: { date: DateStr; lesson?: ResolvedLesson }): void {
  openLessonSheet({ kind: 'date', date: opts.date, lesson: opts.lesson });
}

/** Отменить пару на дату (или вернуть, если она уже отменена изменением; добавленную — удалить). */
export function cancelLessonQuick(date: DateStr, lesson: ResolvedLesson): void {
  const plan = planToggleCancel(date, lesson, currentSources(), newStamp);
  if (plan) applyPlan(plan);
  else showToast({ text: 'Не получилось — расписание уже поменялось', icon: 'info' });
}

/** Убрать замены пары на дату — она снова как по расписанию («Вернуть как было»). */
export function revertLessonQuick(date: DateStr, lesson: ResolvedLesson): void {
  const day = traceDay(date, currentSources());
  const t = findTraced(day, lesson);
  const plan = t ? planRevert(t, day) : null;
  if (plan) applyPlan(plan);
  else showToast({ text: 'Не получилось — расписание уже поменялось', icon: 'info' });
}

/** Шторка «Изменить расписание»: день, выходной, практика, временное расписание, каникулы. */
export function openNewChangeChooser(): void {
  openChangeChooser();
}
