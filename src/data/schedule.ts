// Основное расписание из data/schedule.json и всё, что из него следует.

import scheduleJson from '../../data/schedule.json';
import type { MainSchedule, ScheduleSources } from '../core/schedule';
import { validateMainSchedule } from '../core/validate';

export const mainSchedule = scheduleJson as MainSchedule;

/** Ошибки в data/schedule.json — если они есть, приложение предупредит об этом при запуске. */
export const mainScheduleErrors = validateMainSchedule(mainSchedule);

// На этапе 2 сюда добавятся временные расписания и изменения на дату из памяти устройства.
export const scheduleSources: ScheduleSources = { main: mainSchedule, periods: [], overrides: [] };
