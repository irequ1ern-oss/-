// Основное расписание из data/schedule.json и всё, что из него следует.

import scheduleJson from '../../data/schedule.json';
import type { MainSchedule, ScheduleSources, Subject } from '../core/schedule';
import { validateMainSchedule } from '../core/validate';

export const mainSchedule = scheduleJson as MainSchedule;

/** Ошибки в data/schedule.json — если они есть, приложение покажет их сверху. */
export const mainScheduleErrors = validateMainSchedule(mainSchedule);

const subjectsById = new Map(mainSchedule.subjects.map((s) => [s.id, s]));

export function getSubject(id: string): Subject {
  return subjectsById.get(id) ?? { id, short: id, full: id };
}

// На этапе 2 сюда добавятся временные расписания и изменения на дату из памяти устройства.
const sources: ScheduleSources = { main: mainSchedule, periods: [], overrides: [] };

export function useScheduleSources(): ScheduleSources {
  return sources;
}
