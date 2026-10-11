// Основное расписание из data/schedule.json и всё, что из него следует.

import scheduleJson from '../../data/schedule.json';
import type { MainSchedule } from '../core/schedule';
import { validateMainSchedule } from '../core/validate';

export const mainSchedule = scheduleJson as MainSchedule;

/** Ошибки в data/schedule.json — если они есть, приложение предупредит об этом при запуске. */
export const mainScheduleErrors = validateMainSchedule(mainSchedule);
