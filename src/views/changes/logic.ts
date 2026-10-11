// Что записать в хранилище, когда отменяют, возвращают, заменяют или добавляют пару на дату.
// Только чистые функции: на входе расписание и пара, на выходе — какие изменения сохранить и какие удалить.

import {
  addLessonOverride,
  cancelDayOverride,
  cancelLessonOverride,
  liveOverridesOn,
  replaceLessonOverride,
  type Stamp,
} from '../../core/changes';
import { formatDayMonth, plural } from '../../core/format';
import { holidayMarkOverride, holidayOn, type Holiday } from '../../core/holidays';
import {
  activeLessons,
  activePeriod,
  lessonRoom,
  resolveDay,
  type DateOverride,
  type Lesson,
  type ResolvedLesson,
  type ScheduleSources,
} from '../../core/schedule';
import { addDays, diffDays, isValidDate, toMinutes, weekdayKey, type DateStr } from '../../core/time';

/** Изменения, которые нужно сохранить и удалить одним действием (и отменить тоже разом). */
export interface Plan {
  save: DateOverride[];
  remove: string[];
  /** Текст уведомления «… · Отменить». */
  text: string;
}

// ---------- Какие изменения коснулись пары ----------

export interface TracedLesson {
  /** Постоянный ключ пары в этот день: base:N — N-я пара расписания, add:<id> — добавлена изменением. */
  key: string;
  lesson: ResolvedLesson;
  /** id изменений, которые применились к паре, по порядку (без самого «add»). */
  touched: string[];
  /** Для добавленной пары — id изменения «add». */
  addId?: string;
}

export interface TracedDay {
  lessons: TracedLesson[];
  /** Действующие изменения на дату, в порядке применения. */
  live: DateOverride[];
  unmatched: DateOverride[];
}

function bare(l: Lesson): Lesson {
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

/**
 * День как в resolveDay, но у каждой пары есть постоянный ключ и список изменений, которые её коснулись.
 * По ним видно, что именно удалить, чтобы вернуть пару, и какую замену поправить, а не добавлять новую.
 * Совпадение с resolveDay проверяет тест.
 */
export function traceDay(date: DateStr, src: ScheduleSources, overrides = src.overrides): TracedDay {
  const period = activePeriod(date, src.periods);
  const source = period ? 'period' : 'main';
  const base = (period ? period.week[weekdayKey(date)] : src.main.week[weekdayKey(date)]) ?? [];
  let list: TracedLesson[] = base.map((l, i) => ({
    key: `base:${i}`,
    lesson: { ...bare(l), date, source, status: 'normal' },
    touched: [],
  }));
  const live = liveOverridesOn(date, overrides);
  const unmatched: DateOverride[] = [];
  for (const o of live) {
    if (o.action === 'cancelDay') {
      list = list.map((t) =>
        t.lesson.status === 'cancelled'
          ? t
          : { ...t, lesson: { ...t.lesson, status: 'cancelled', changeNote: o.note ?? t.lesson.changeNote }, touched: [...t.touched, o.id] },
      );
      continue;
    }
    if (o.action === 'add') {
      list.push({
        key: `add:${o.id}`,
        lesson: { ...bare(o.lesson), date, source: 'override', status: 'added', changeNote: o.note },
        touched: [],
        addId: o.id,
      });
      continue;
    }
    const idx = list.findIndex((t) => t.lesson.start === o.target && t.lesson.status !== 'cancelled');
    if (idx === -1) {
      unmatched.push(o);
      continue;
    }
    const t = list[idx];
    const current = t.lesson;
    let lesson: ResolvedLesson;
    if (o.action === 'cancel') {
      lesson = { ...current, status: 'cancelled', changeNote: o.note ?? current.changeNote };
    } else {
      const from = o.lesson.room !== undefined && o.lesson.rooms === undefined ? { ...current, rooms: undefined } : current;
      lesson = {
        ...from,
        ...o.lesson,
        status: current.status === 'added' ? 'added' : 'changed',
        original: current.original ?? bare(current),
        changeNote: o.note ?? current.changeNote,
      };
    }
    list[idx] = { ...t, lesson, touched: [...t.touched, o.id] };
  }
  list.sort((a, b) => toMinutes(a.lesson.start) - toMinutes(b.lesson.start) || toMinutes(a.lesson.end) - toMinutes(b.lesson.end));
  return { lessons: list, live, unmatched };
}

function sameRooms(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((r, i) => r === b[i]);
}

/** Пара дня, которая выглядит так же, как переданная (её показывает другой экран). */
export function findTraced(day: TracedDay, lesson: ResolvedLesson): TracedLesson | undefined {
  return day.lessons.find(
    (t) =>
      t.lesson.start === lesson.start &&
      t.lesson.end === lesson.end &&
      t.lesson.subjectId === lesson.subjectId &&
      t.lesson.status === lesson.status &&
      t.lesson.source === lesson.source &&
      t.lesson.room === lesson.room &&
      sameRooms(t.lesson.rooms, lesson.rooms),
  );
}

function byKey(day: TracedDay, key: string): TracedLesson | undefined {
  return day.lessons.find((t) => t.key === key);
}

// ---------- Отменить и вернуть ----------

/** Отменить пару (добавленную — удалить), а отменённую — вернуть. null — пара не нашлась. */
export function planToggleCancel(date: DateStr, lesson: ResolvedLesson, src: ScheduleSources, stamp: () => Stamp): Plan | null {
  const day = traceDay(date, src);
  const t = findTraced(day, lesson);
  if (!t) return null;
  if (t.lesson.status === 'cancelled') return planRestore(date, t, day, src, stamp);
  if (t.addId) return planRemoveAdded(t, day);
  return { save: [cancelLessonOverride(date, t.lesson.start, stamp())], remove: [], text: 'Пара отменена' };
}

/** Удалить добавленную пару вместе с заменами, которые к ней относились. */
export function planRemoveAdded(t: TracedLesson, day: TracedDay): Plan | null {
  if (!t.addId) return null;
  const dayWide = new Set(day.live.filter((o) => o.action === 'cancelDay').map((o) => o.id));
  return { save: [], remove: [t.addId, ...t.touched.filter((id) => !dayWide.has(id))], text: 'Пара удалена' };
}

/**
 * Вернуть отменённую пару. Если её отменила отдельная отмена — удаляем её.
 * Если весь день отмечен «Пар нет» — снимаем отметку, а остальные пары дня отменяем по одной
 * (с той же причиной): вернуть нужно только эту.
 */
function planRestore(date: DateStr, t: TracedLesson, day: TracedDay, src: ScheduleSources, stamp: () => Stamp): Plan | null {
  const byId = new Map(day.live.map((o) => [o.id, o]));
  const remove = new Set<string>();
  const without = () => day.live.filter((o) => !remove.has(o.id));
  let canceller = byId.get(t.touched[t.touched.length - 1]);
  if (canceller?.action === 'cancel') {
    remove.add(canceller.id);
    const after = byKey(traceDay(date, src, without()), t.key);
    if (after && after.lesson.status !== 'cancelled') return { save: [], remove: [...remove], text: 'Пара возвращена' };
    canceller = after ? byId.get(after.touched[after.touched.length - 1]) : undefined;
  }
  if (canceller?.action !== 'cancelDay') return null;

  for (const o of day.live) if (o.action === 'cancelDay') remove.add(o.id);
  const opened = traceDay(date, src, without());
  const save: DateOverride[] = [];
  for (const other of opened.lessons) {
    if (other.key === t.key || other.lesson.status === 'cancelled') continue;
    if (byKey(day, other.key)?.lesson.status !== 'cancelled') continue;
    save.push(cancelLessonOverride(date, other.lesson.start, stamp(), canceller.note));
  }
  // Проверяем результат: вернулась именно эта пара, остальные так и остались отменёнными.
  const result = traceDay(date, src, [...without(), ...save]);
  const back = byKey(result, t.key);
  if (!back || back.lesson.status === 'cancelled') return null;
  for (const other of day.lessons) {
    if (other.key !== t.key && other.lesson.status === 'cancelled' && byKey(result, other.key)?.lesson.status !== 'cancelled') return null;
  }
  return { save, remove: [...remove], text: 'Пара возвращена' };
}

/** Убрать замены пары — она снова как по расписанию. */
export function planRevert(t: TracedLesson, day: TracedDay): Plan | null {
  const replaces = t.touched.filter((id) => day.live.find((o) => o.id === id)?.action === 'replace');
  return replaces.length ? { save: [], remove: replaces, text: 'Замена убрана' } : null;
}

// ---------- Заменить и добавить ----------

/** Что ввели в форме пары. room — один кабинет (пустая строка — без кабинета). */
export interface LessonInput {
  subjectId: string;
  start: string;
  end: string;
  room: string;
}

const clean = (s: string | undefined) => s?.trim() ?? '';

function samePatch(a: Partial<Lesson>, b: Partial<Lesson>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof Lesson)[]);
  return [...keys].every((k) => (k === 'rooms' ? sameRooms(a.rooms, b.rooms) : a[k] === b[k]));
}

/**
 * Замена пары на дату. Патч считается от пары по расписанию (до всех замен), поэтому повторная правка
 * поправляет ту же замену, а не накладывает новую. Если всё вернули как было — замена удаляется.
 * Добавленная пара правится прямо в своём изменении «add». У отменённой пары «заменить» — значит добавить новую.
 */
export function planEditLesson(
  date: DateStr,
  lesson: ResolvedLesson,
  input: LessonInput,
  note: string,
  src: ScheduleSources,
  subgroup: number,
  stamp: () => Stamp,
): Plan | null {
  const day = traceDay(date, src);
  const t = findTraced(day, lesson);
  if (!t) return null;
  const reason = clean(note) || undefined;
  const room = clean(input.room);

  if (t.lesson.status === 'cancelled') return planAddLesson(date, input, note, stamp);

  if (t.addId) {
    const add = day.live.find((o) => o.id === t.addId);
    if (!add || add.action !== 'add') return null;
    const next: Lesson = {
      start: input.start,
      end: input.end,
      subjectId: input.subjectId,
      ...(room && { room }),
      ...(add.lesson.note !== undefined && { note: add.lesson.note }),
    };
    const replaces = t.touched;
    if (!replaces.length && samePatch(next, add.lesson) && reason === add.note) return null;
    const { note: _old, ...rest } = add;
    return { save: [{ ...rest, lesson: next, ...(reason !== undefined && { note: reason }) }], remove: replaces, text: 'Пара изменена' };
  }

  const base = t.lesson.original ?? t.lesson;
  const patch: Partial<Lesson> = {};
  if (input.subjectId !== base.subjectId) patch.subjectId = input.subjectId;
  if (input.start !== base.start) patch.start = input.start;
  if (input.end !== base.end) patch.end = input.end;
  if (room !== (lessonRoom(base, subgroup) ?? '')) patch.room = room;
  const empty = Object.keys(patch).length === 0;

  const replaces = t.touched.map((id) => day.live.find((o) => o.id === id)).filter((o): o is DateOverride => o?.action === 'replace');
  if (replaces.length === 1 && replaces[0].action === 'replace') {
    const r = replaces[0];
    if (empty) return { save: [], remove: [r.id], text: 'Замена убрана' };
    if (samePatch(patch, r.lesson) && reason === r.note) return null;
    const { note: _old, ...rest } = r;
    return { save: [{ ...rest, lesson: patch, ...(reason !== undefined && { note: reason }) }], remove: [], text: 'Замена сохранена' };
  }
  if (empty) return replaces.length ? { save: [], remove: replaces.map((r) => r.id), text: 'Замена убрана' } : null;
  return {
    save: [replaceLessonOverride(date, base.start, patch, stamp(), reason)],
    remove: replaces.map((r) => r.id),
    text: 'Пара заменена',
  };
}

export function planAddLesson(date: DateStr, input: LessonInput, note: string, stamp: () => Stamp): Plan {
  const room = clean(input.room);
  const lesson: Lesson = { start: input.start, end: input.end, subjectId: input.subjectId, ...(room && { room }) };
  return { save: [addLessonOverride(date, lesson, stamp(), note)], remove: [], text: 'Пара добавлена' };
}

// ---------- Весь день ----------

/** «Пар нет весь день»: включить (в праздник причина — его название) или выключить. */
export function planDayOff(date: DateStr, on: boolean, note: string, src: ScheduleSources, stamp: () => Stamp): Plan | null {
  const marks = liveOverridesOn(date, src.overrides).filter((o) => o.action === 'cancelDay');
  if (!on) return marks.length ? { save: [], remove: marks.map((o) => o.id), text: 'Пары возвращены' } : null;
  if (marks.length) return null;
  const reason = clean(note) || holidayOn(date)?.name;
  return { save: [cancelDayOverride(date, stamp(), reason)], remove: [], text: 'Пары на весь день отменены' };
}

/** Новая причина у «Пар нет весь день». */
export function planDayOffNote(date: DateStr, note: string, src: ScheduleSources): Plan | null {
  const reason = clean(note) || undefined;
  const marks = liveOverridesOn(date, src.overrides).filter((o) => o.action === 'cancelDay' && (o.note ?? undefined) !== reason);
  if (!marks.length) return null;
  const save = marks.map((o) => {
    const { note: _old, ...rest } = o;
    return { ...rest, ...(reason !== undefined && { note: reason }) } as DateOverride;
  });
  return { save, remove: [], text: reason ? 'Причина сохранена' : 'Причина убрана' };
}

/** Сбросить все изменения дня. */
export function planResetDay(date: DateStr, src: ScheduleSources): Plan | null {
  const live = liveOverridesOn(date, src.overrides);
  return live.length ? { save: [], remove: live.map((o) => o.id), text: 'Изменения дня сброшены' } : null;
}

/** Самый длинный «Выходной день»: дольше — это уже каникулы. */
export const DAYS_OFF_MAX = 31;

/**
 * «Выходной день» на дату или промежуток: «Пар нет весь день» в каждый день, где по расписанию есть пары
 * и выходной ещё не отмечен. Без причины в праздник причина — его название (так он виден в «Праздниках»).
 */
export function planDaysOff(
  from: DateStr,
  to: DateStr,
  note: string,
  src: ScheduleSources,
  stamp: () => Stamp,
): { plan: Plan } | { error: string } {
  if (!isValidDate(from) || !isValidDate(to)) return { error: 'Укажи дату' };
  if (to < from) return { error: 'Дата «по» раньше даты «с»' };
  if (diffDays(from, to) + 1 > DAYS_OFF_MAX) return { error: `Не больше ${DAYS_OFF_MAX} дня подряд — для долгого перерыва добавь каникулы` };
  const reason = clean(note);
  const save: DateOverride[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = resolveDay(d, src);
    if (day.overrides.some((o) => o.action === 'cancelDay') || activeLessons(day).length === 0) continue;
    save.push(cancelDayOverride(d, stamp(), reason || holidayOn(d)?.name));
  }
  if (!save.length) return { error: from === to ? 'В этот день пар и так нет' : 'В эти дни пар и так нет' };
  const text = save.length === 1 ? `${formatDayMonth(save[0].date)} — выходной` : `Отмечено выходных: ${save.length}`;
  return { plan: { save, remove: [], text } };
}

/** Сколько учебных дней (с парами, без отмеченного выходного) с from по to. */
export function schoolDaysCount(from: DateStr, to: DateStr, src: ScheduleSources): number {
  if (!isValidDate(from) || !isValidDate(to) || to < from || diffDays(from, to) >= DAYS_OFF_MAX) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = resolveDay(d, src);
    if (!day.overrides.some((o) => o.action === 'cancelDay') && activeLessons(day).length > 0) n++;
  }
  return n;
}

// ---------- Праздники ----------

/** Отметить праздники выходными (те, что ещё не отмечены). */
export function planMarkHolidays(holidays: Holiday[], stamp: () => Stamp): Plan | null {
  if (!holidays.length) return null;
  const save = holidays.map((h) => holidayMarkOverride(h, stamp()));
  const text =
    save.length === 1
      ? `${formatDayMonth(save[0].date)} — выходной`
      : `Отмечено ${save.length} ${plural(save.length, 'праздник', 'праздника', 'праздников')}`;
  return { save, remove: [], text };
}

export function planUnmarkHolidays(marks: DateOverride[]): Plan | null {
  if (!marks.length) return null;
  return { save: [], remove: marks.map((o) => o.id), text: marks.length === 1 ? 'Отметка снята' : 'Отметки сняты' };
}
