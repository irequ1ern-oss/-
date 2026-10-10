// Действия с изменениями расписания, которые вызывают другие экраны («Сегодня», «Неделя», меню пары, «+»).
// ЗАГОТОВКА: реализацию пишет этап 2 (src/views/changes/*); сигнатуры менять нельзя — на них опираются другие экраны.

import type { ResolvedLesson } from '../../core/schedule';
import type { DateStr } from '../../core/time';
import type { Undo } from '../../state/changes';

/** Уведомление внизу с кнопкой «Отменить». */
export function notifyChange(_text: string, _undo: Undo): void {}

/** Шторка с правкой дня. */
export function openDayEditor(_date: DateStr): void {}

/** Шторка «Заменить пару» (с lesson) или «Добавить пару» (без). */
export function openLessonEditor(_opts: { date: DateStr; lesson?: ResolvedLesson }): void {}

/** Отменить пару на дату (или вернуть, если она уже отменена изменением). */
export function cancelLessonQuick(_date: DateStr, _lesson: ResolvedLesson): void {}

/** Шторка «Изменить расписание»: день, выходной, практика, временное расписание, каникулы. */
export function openNewChangeChooser(): void {}
