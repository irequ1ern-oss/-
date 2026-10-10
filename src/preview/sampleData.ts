// Примерные данные для превью дизайна: ДЗ, события и одна замена в расписании.

import { activeLessons, findNextLessonOfSubject, resolveDay, type DateOverride, type ScheduleSources } from '../core/schedule';
import { addDays, startOfWeek, weekdayIndex, type DateStr } from '../core/time';
import { mainSchedule } from '../data/schedule';
import type { AppData, EventItem, HomeworkItem } from '../shell/app';

/** Все примерные данные для превью относительно «сегодня» (даты ДЗ и замена — от этого дня). */
export function demoData(today: DateStr): AppData {
  const src = sampleSources(today);
  return {
    main: mainSchedule,
    src,
    homework: sampleHomework(today, src),
    events: sampleEvents(today, src),
    demo: true,
  };
}

/** Расписание превью: основное и одна замена в четверг. */
export function sampleSources(today: DateStr): ScheduleSources {
  return { main: mainSchedule, periods: [], overrides: sampleOverrides(today) };
}

/** Ближайший будний день не раньше даты — запасной вариант, если пары предмета не нашлось. */
function weekdayFrom(date: DateStr): DateStr {
  const wd = weekdayIndex(date);
  return wd < 5 ? date : addDays(date, 7 - wd);
}

/** Пара предмета в этот день или позже: ДЗ и контрольные — «к паре», а не на выходные. */
function lessonOnOrAfter(subjectId: string, date: DateStr, src: ScheduleSources): DateStr {
  return findNextLessonOfSubject(subjectId, addDays(date, -1), src)?.date ?? weekdayFrom(date);
}

/** Последняя пара предмета в этот день или раньше — для просроченных и уже сделанных ДЗ. */
function lessonOnOrBefore(subjectId: string, date: DateStr, src: ScheduleSources): DateStr {
  for (let i = 0; i < 60; i++) {
    const d = addDays(date, -i);
    if (activeLessons(resolveDay(d, src)).some((l) => l.subjectId === subjectId)) return d;
  }
  return date;
}

/**
 * Срок ДЗ — день пары предмета: «через n дней» — ближайшая пара не раньше этого дня, «n дней назад» —
 * последняя пара не позже. Так ни в одном из пяти состояний превью срок не выпадает на выходной;
 * одно ДЗ просрочено (h1), четыре уже сделаны (h6–h9).
 */
export function sampleHomework(today: DateStr, src = sampleSources(today)): HomeworkItem[] {
  const ahead = (subjectId: string, n: number) => lessonOnOrAfter(subjectId, addDays(today, n), src);
  const back = (subjectId: string, n: number) => lessonOnOrBefore(subjectId, addDays(today, -n), src);
  return [
    { id: 'h1', subjectId: 'mss', title: 'Задачи 3–5, стр. 42', due: back('mss', 1), done: false },
    { id: 'h2', subjectId: 'ig', title: 'Чертёж вала, формат А4', due: ahead('ig', 0), done: false },
    { id: 'h3', subjectId: 'pfo', title: 'Конспект: виды резцов', due: ahead('pfo', 1), done: false },
    { id: 'h4', subjectId: 'history', title: 'Доклад о реформах Петра I', due: ahead('history', 3), done: false },
    { id: 'h5', subjectId: 'lang', title: 'Перевод текста, упр. 7', due: ahead('lang', 6), done: false },
    { id: 'h10', subjectId: 'mdk0401', title: 'Схема базирования заготовки', due: ahead('mdk0401', 0), done: false },
    { id: 'h6', subjectId: 'matved', title: 'Таблица свойств сплавов', due: back('matved', 2), done: true },
    { id: 'h7', subjectId: 'obp', title: 'Карта потока создания ценности', due: back('obp', 3), done: true },
    { id: 'h8', subjectId: 'mdk0402', title: 'Отчёт по лабораторной №2', due: ahead('mdk0402', 0), done: true },
    { id: 'h9', subjectId: 'bzh', title: 'Тест по первой помощи', due: ahead('bzh', 2), done: true },
  ];
}

/** Контрольная и сдача отчёта — тоже на парах этих предметов. */
export function sampleEvents(today: DateStr, src = sampleSources(today)): EventItem[] {
  return [
    { id: 'e1', subjectId: 'mss', title: 'Контрольная по допускам и посадкам', date: lessonOnOrAfter('mss', addDays(today, 1), src), kind: 'test' },
    { id: 'e2', subjectId: 'mdk0601', title: 'Сдача отчёта по практике', date: lessonOnOrAfter('mdk0601', addDays(today, 4), src), kind: 'deadline' },
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
