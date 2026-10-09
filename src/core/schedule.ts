// Какое расписание действует на дату.
// Приоритет: изменения на конкретную дату > временное расписание на период > основное расписание.

import { addDays, toMinutes, weekdayKey, type DateStr, type TimeStr, type WeekdayKey } from './time';

export interface Subject {
  id: string;
  /** Сокращение, которое показывается на карточке: «МСС». */
  short: string;
  /** Полное название: «Метрология, стандартизация и сертификация». */
  full: string;
  /** Иконка по умолчанию (имя из src/ui/iconData.ts), например «ruler». */
  icon?: string;
  /** Цвет по умолчанию из палитры предметов; если не указан — подбирается автоматически. */
  color?: string;
}

export interface Lesson {
  start: TimeStr;
  end: TimeStr;
  subjectId: string;
  /** Кабинет, общий для всех. */
  room?: string;
  /** Кабинеты по подгруппам: rooms[0] — 1-я подгруппа, rooms[1] — 2-я. Важнее, чем room. */
  rooms?: string[];
  /** Пояснение к паре. */
  note?: string;
}

export type Week = Partial<Record<WeekdayKey, Lesson[]>>;

/** Содержимое data/schedule.json. */
export interface MainSchedule {
  version: number;
  /** Сколько подгрупп в группе (для настройки «Подгруппа»). */
  subgroups?: number;
  subjects: Subject[];
  week: Week;
}

/** Временное расписание: своя неделя, которая с from по to заменяет основную. */
export interface SchedulePeriod {
  id: string;
  title: string;
  from: DateStr;
  to: DateStr;
  week: Week;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

interface OverrideBase {
  id: string;
  date: DateStr;
  note?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/**
 * Изменение на конкретную дату.
 * target — время начала пары, к которой относится изменение.
 */
export type DateOverride = OverrideBase &
  (
    | { action: 'cancel'; target: TimeStr }
    | { action: 'replace'; target: TimeStr; lesson: Partial<Lesson> }
    | { action: 'add'; lesson: Lesson }
    | { action: 'cancelDay' }
  );

export type LessonSource = 'main' | 'period' | 'override';
export type LessonStatus = 'normal' | 'cancelled' | 'changed' | 'added';

export interface ResolvedLesson extends Lesson {
  date: DateStr;
  /** Откуда взялась пара: основное расписание, временное или добавлена изменением. */
  source: LessonSource;
  status: LessonStatus;
  /** Какой пара была до замены. */
  original?: Lesson;
  /** Комментарий к изменению («замена», «перенос»). */
  changeNote?: string;
}

export interface ResolvedDay {
  date: DateStr;
  /** Все пары дня по времени, включая отменённые (их показываем зачёркнутыми). */
  lessons: ResolvedLesson[];
  /** Временное расписание, которое действует в этот день. */
  period?: SchedulePeriod;
  /** Изменения на эту дату, которые удалось применить. */
  overrides: DateOverride[];
  /** Изменения, для которых не нашлась пара (например, пару уже убрали из расписания). */
  unmatched: DateOverride[];
}

export interface ScheduleSources {
  main: MainSchedule;
  periods: SchedulePeriod[];
  overrides: DateOverride[];
}

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** Сравнение «кто создан раньше»; при равенстве — по id, чтобы порядок был стабильным. */
function byCreated(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  return timeOf(a.createdAt) - timeOf(b.createdAt) || a.id.localeCompare(b.id);
}

/** Временное расписание, действующее в эту дату. Если периоды пересекаются, побеждает созданный позже. */
export function activePeriod(date: DateStr, periods: SchedulePeriod[]): SchedulePeriod | undefined {
  let found: SchedulePeriod | undefined;
  for (const p of periods) {
    if (p.deleted || date < p.from || date > p.to) continue;
    if (!found || byCreated(found, p) < 0) found = p;
  }
  return found;
}

function bareLesson(l: ResolvedLesson | Lesson): Lesson {
  const { start, end, subjectId, room, rooms, note } = l;
  return {
    start,
    end,
    subjectId,
    ...(room !== undefined && { room }),
    ...(rooms !== undefined && { rooms: [...rooms] }),
    ...(note !== undefined && { note }),
  };
}

/** Кабинет пары для подгруппы (1 или 2). Кабинет по подгруппам важнее общего. */
export function lessonRoom(lesson: Lesson, subgroup: number): string | undefined {
  return lesson.rooms?.[subgroup - 1] ?? lesson.room ?? lesson.rooms?.[0];
}

function sortLessons(lessons: ResolvedLesson[]): ResolvedLesson[] {
  return lessons.sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end));
}

export function resolveDay(date: DateStr, src: ScheduleSources): ResolvedDay {
  const period = activePeriod(date, src.periods);
  const key = weekdayKey(date);
  const source: LessonSource = period ? 'period' : 'main';
  const base = (period ? period.week[key] : src.main.week[key]) ?? [];

  let lessons: ResolvedLesson[] = base.map((l) => ({ ...bareLesson(l), date, source, status: 'normal' }));
  const applied: DateOverride[] = [];
  const unmatched: DateOverride[] = [];

  const dayOverrides = src.overrides.filter((o) => !o.deleted && o.date === date).sort(byCreated);

  for (const o of dayOverrides) {
    if (o.action === 'cancelDay') {
      lessons = lessons.map((l) =>
        l.status === 'cancelled' ? l : { ...l, status: 'cancelled', changeNote: o.note ?? l.changeNote },
      );
      applied.push(o);
      continue;
    }
    if (o.action === 'add') {
      lessons.push({ ...bareLesson(o.lesson), date, source: 'override', status: 'added', changeNote: o.note });
      applied.push(o);
      continue;
    }
    const idx = lessons.findIndex((l) => l.start === o.target && l.status !== 'cancelled');
    if (idx === -1) {
      unmatched.push(o);
      continue;
    }
    const current = lessons[idx];
    if (o.action === 'cancel') {
      lessons[idx] = { ...current, status: 'cancelled', changeNote: o.note ?? current.changeNote };
    } else {
      // Замена кабинета одним полем room отменяет кабинеты по подгруппам.
      const base = o.lesson.room !== undefined && o.lesson.rooms === undefined ? { ...current, rooms: undefined } : current;
      lessons[idx] = {
        ...base,
        ...o.lesson,
        status: current.status === 'added' ? 'added' : 'changed',
        original: current.original ?? bareLesson(current),
        changeNote: o.note ?? current.changeNote,
      };
    }
    applied.push(o);
  }

  return { date, lessons: sortLessons(lessons), period, overrides: applied, unmatched };
}

/** Есть ли в этот день отличия от основного расписания. */
export function dayHasChanges(day: ResolvedDay): boolean {
  return Boolean(day.period) || day.overrides.length > 0;
}

export function activeLessons(day: ResolvedDay): ResolvedLesson[] {
  return day.lessons.filter((l) => l.status !== 'cancelled');
}

/**
 * Следующая пара предмета после указанной даты: идём по дням вперёд и берём
 * первую неотменённую пару этого предмета с учётом временного расписания и замен.
 * Пары в тот же день не считаются: срок ДЗ — следующий день, когда есть предмет.
 */
export function findNextLessonOfSubject(
  subjectId: string,
  afterDate: DateStr,
  src: ScheduleSources,
  maxDays = 60,
): ResolvedLesson | null {
  for (let i = 1; i <= maxDays; i++) {
    const day = resolveDay(addDays(afterDate, i), src);
    const lesson = activeLessons(day).find((l) => l.subjectId === subjectId);
    if (lesson) return lesson;
  }
  return null;
}
