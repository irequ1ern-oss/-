// Примерные данные для превью дизайна: ДЗ, события и одна замена в расписании.

import type { DateOverride } from '../core/schedule';
import { addDays, startOfWeek, type DateStr } from '../core/time';
import { mainSchedule } from '../data/schedule';
import type { AppData, EventItem, HomeworkItem } from '../shell/app';

/** Все примерные данные для превью относительно «сегодня» (даты ДЗ и замена — от этого дня). */
export function demoData(today: DateStr): AppData {
  return {
    main: mainSchedule,
    src: { main: mainSchedule, periods: [], overrides: sampleOverrides(today) },
    homework: sampleHomework(today),
    events: sampleEvents(today),
    demo: true,
  };
}

export function sampleHomework(today: DateStr): HomeworkItem[] {
  const d = (n: number) => addDays(today, n);
  return [
    { id: 'h1', subjectId: 'mss', title: 'Задачи 3–5, стр. 42', due: d(-1), done: false },
    { id: 'h2', subjectId: 'ig', title: 'Чертёж вала, формат А4', due: d(0), done: false },
    { id: 'h3', subjectId: 'pfo', title: 'Конспект: виды резцов', due: d(1), done: false },
    { id: 'h4', subjectId: 'history', title: 'Доклад о реформах Петра I', due: d(3), done: false },
    { id: 'h5', subjectId: 'lang', title: 'Перевод текста, упр. 7', due: d(6), done: false },
    { id: 'h6', subjectId: 'matved', title: 'Таблица свойств сплавов', due: d(-2), done: true },
    { id: 'h7', subjectId: 'obp', title: 'Карта потока создания ценности', due: d(-3), done: true },
    { id: 'h8', subjectId: 'mdk0402', title: 'Отчёт по лабораторной №2', due: d(0), done: true },
    { id: 'h9', subjectId: 'bzh', title: 'Тест по первой помощи', due: d(2), done: true },
  ];
}

export function sampleEvents(today: DateStr): EventItem[] {
  return [
    { id: 'e1', subjectId: 'mss', title: 'Контрольная по допускам и посадкам', date: addDays(today, 2), kind: 'test' },
    { id: 'e2', subjectId: 'mdk0601', title: 'Сдача отчёта по практике', date: addDays(today, 5), kind: 'deadline' },
  ];
}

/** Одна замена кабинета в четверг этой недели — чтобы было видно точку «изменения» и пометку «замена». */
export function sampleOverrides(today: DateStr): DateOverride[] {
  const thursday = addDays(startOfWeek(today), 3);
  return [
    {
      id: 'o1',
      date: thursday,
      action: 'replace',
      target: '11:55',
      lesson: { room: '12' },
      note: 'замена кабинета',
      createdAt: '2026-10-09T10:00:00+03:00',
      updatedAt: '2026-10-09T10:00:00+03:00',
    },
  ];
}
