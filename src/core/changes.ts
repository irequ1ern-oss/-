// Изменения расписания (этап 2): как собрать изменение на дату или временное расписание,
// как их подписать и проверить. Только чистые функции — без DOM и хранилища.

import { formatDateRange, formatRoom, plural } from './format';
import {
  resolveDay,
  type DateOverride,
  type Lesson,
  type PeriodKind,
  type PracticeSpec,
  type SchedulePeriod,
  type ScheduleSources,
  type Week,
} from './schedule';
import {
  WEEKDAY_KEYS,
  addDays,
  diffDays,
  isValidDate,
  isValidTime,
  startOfWeek,
  toMinutes,
  weekdayKey,
  type DateStr,
  type TimeStr,
  type WeekdayKey,
} from './time';

/** id и время создания записи — их передаёт вызывающий (так функции легко проверять тестами). */
export interface Stamp {
  id: string;
  /** ISO-время: `new Date().toISOString()`. */
  now: string;
}

/** Пустая или из одних пробелов строка — значит «не указано». */
function text(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

function base(date: DateStr, stamp: Stamp, note: string | undefined) {
  const n = text(note);
  return { id: stamp.id, date, ...(n !== undefined && { note: n }), createdAt: stamp.now, updatedAt: stamp.now };
}

/** Копия пары без лишних полей: undefined не сохраняем, кабинеты по подгруппам — новым массивом. */
function cleanLesson(l: Lesson): Lesson {
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

function cleanPatch(patch: Partial<Lesson>): Partial<Lesson> {
  const out: Partial<Lesson> = {};
  if (patch.start !== undefined) out.start = patch.start;
  if (patch.end !== undefined) out.end = patch.end;
  if (patch.subjectId !== undefined) out.subjectId = patch.subjectId;
  if (patch.room !== undefined) out.room = patch.room;
  if (patch.rooms !== undefined) out.rooms = [...patch.rooms];
  if (patch.note !== undefined) out.note = patch.note;
  return out;
}

// ——— Изменения на дату ———

export function cancelLessonOverride(date: DateStr, target: TimeStr, stamp: Stamp, note?: string): DateOverride {
  return { ...base(date, stamp, note), action: 'cancel', target };
}

/** Замена пары: в patch — только то, что поменялось (предмет, время, кабинет). */
export function replaceLessonOverride(
  date: DateStr,
  target: TimeStr,
  patch: Partial<Lesson>,
  stamp: Stamp,
  note?: string,
): DateOverride {
  return { ...base(date, stamp, note), action: 'replace', target, lesson: cleanPatch(patch) };
}

export function addLessonOverride(date: DateStr, lesson: Lesson, stamp: Stamp, note?: string): DateOverride {
  return { ...base(date, stamp, note), action: 'add', lesson: cleanLesson(lesson) };
}

/** «Пар нет весь день»: праздник, внезапный выходной. Пары, добавленные позже, всё равно будут. */
export function cancelDayOverride(date: DateStr, stamp: Stamp, note?: string): DateOverride {
  return { ...base(date, stamp, note), action: 'cancelDay' };
}

// ——— Временное расписание ———

/** Полная копия недели: правки копии не трогают оригинал. */
export function copyWeek(week: Week): Week {
  const out: Week = {};
  for (const key of WEEKDAY_KEYS) {
    const lessons = week[key];
    if (lessons) out[key] = lessons.map(cleanLesson);
  }
  return out;
}

/** Дни недели по порядку пн → вс, без повторов. */
function orderedDays(days: readonly WeekdayKey[]): WeekdayKey[] {
  return WEEKDAY_KEYS.filter((k) => days.includes(k));
}

/** Неделя шаблона «Практика»: в каждый выбранный день — одно и то же занятие. */
export function practiceWeek(spec: PracticeSpec): Week {
  const room = text(spec.room);
  const note = text(spec.note);
  const week: Week = {};
  for (const key of orderedDays(spec.days)) {
    week[key] = [
      {
        start: spec.start,
        end: spec.end,
        subjectId: spec.subjectId,
        ...(room !== undefined && { room }),
        ...(note !== undefined && { note }),
      },
    ];
  }
  return week;
}

/** Шаблон «Практика» по умолчанию: пн–пт 09:00–14:40, предмет выбирается в редакторе. */
export function defaultPracticeSpec(subjectId = ''): PracticeSpec {
  return { subjectId, start: '09:00', end: '14:40', days: ['mon', 'tue', 'wed', 'thu', 'fri'] };
}

const DEFAULT_TITLES: Record<PeriodKind, string> = {
  custom: 'Временное расписание',
  practice: 'Практика',
  break: 'Каникулы',
};

/**
 * Новое временное расписание.
 * custom — копия основной недели (её потом правят), practice — неделя из шаблона, break — дни без пар.
 */
export function newPeriod(
  kind: PeriodKind,
  from: DateStr,
  to: DateStr,
  stamp: Stamp,
  opts: { mainWeek: Week; title?: string; practice?: PracticeSpec },
): SchedulePeriod {
  const title = text(opts.title) ?? DEFAULT_TITLES[kind];
  const common = { id: stamp.id, title, from, to, kind, createdAt: stamp.now, updatedAt: stamp.now };
  if (kind === 'practice') {
    const spec = opts.practice ?? defaultPracticeSpec();
    const practice: PracticeSpec = {
      subjectId: spec.subjectId,
      start: spec.start,
      end: spec.end,
      ...(text(spec.room) !== undefined && { room: text(spec.room) }),
      ...(text(spec.note) !== undefined && { note: text(spec.note) }),
      days: orderedDays(spec.days),
    };
    return { ...common, week: practiceWeek(practice), practice };
  }
  return { ...common, week: kind === 'custom' ? copyWeek(opts.mainWeek) : {} };
}

// ——— Списки ———

function timeOf(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/** Тот же порядок, что в resolveDay: кто создан раньше, при равенстве — по id. */
function byCreated(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  return timeOf(a.createdAt) - timeOf(b.createdAt) || a.id.localeCompare(b.id);
}

/** Действующие (не удалённые) изменения на дату — в том порядке, в каком они применяются. */
export function liveOverridesOn(date: DateStr, overrides: DateOverride[]): DateOverride[] {
  return overrides.filter((o) => !o.deleted && o.date === date).sort(byCreated);
}

export type PeriodStatus = 'current' | 'upcoming' | 'past';

/** Границы периода включительно: в день to расписание ещё действует. */
export function periodStatus(p: SchedulePeriod, today: DateStr): PeriodStatus {
  if (today < p.from) return 'upcoming';
  if (today > p.to) return 'past';
  return 'current';
}

export interface DateGroup {
  date: DateStr;
  overrides: DateOverride[];
}

/** Изменения по датам: впереди (с сегодняшнего дня) — по возрастанию, прошедшие — от недавних к старым. */
export function groupOverridesByDate(
  overrides: DateOverride[],
  today: DateStr,
): { upcoming: DateGroup[]; past: DateGroup[] } {
  const byDate = new Map<DateStr, DateOverride[]>();
  for (const o of overrides) {
    if (o.deleted) continue;
    const list = byDate.get(o.date);
    if (list) list.push(o);
    else byDate.set(o.date, [o]);
  }
  const groups = [...byDate].map(([date, list]) => ({ date, overrides: list.sort(byCreated) }));
  return {
    upcoming: groups.filter((g) => g.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1)),
    past: groups.filter((g) => g.date < today).sort((a, b) => (a.date > b.date ? -1 : 1)),
  };
}

// ——— Подписи ———

function timeRange(start: TimeStr, end: TimeStr): string {
  return `${start}–${end}`;
}

/** Кабинет пары одной строкой: общий или по подгруппам через «/». */
function roomText(l: Partial<Lesson>): string | undefined {
  if (l.rooms?.length) return l.rooms.join('/');
  return l.room;
}

/**
 * Какой была пара, к которой относится изменение, до него самого:
 * день по расписанию с изменениями, созданными раньше этого.
 * Если там её нет (например, пару уже отменили другим изменением) — пара из расписания без изменений.
 */
function lessonBefore(o: DateOverride & { target: TimeStr }, src: ScheduleSources): Lesson | undefined {
  const earlier = liveOverridesOn(o.date, src.overrides).filter((x) => x.id !== o.id && byCreated(x, o) < 0);
  const day = resolveDay(o.date, { ...src, overrides: earlier });
  const found = day.lessons.find((l) => l.start === o.target && l.status !== 'cancelled');
  return found ?? resolveDay(o.date, { ...src, overrides: [] }).lessons.find((l) => l.start === o.target);
}

/** Что поменяла замена: новый предмет, время, кабинет. Без исходной пары — всё, что есть в patch. */
function replaceParts(patch: Partial<Lesson>, before: Lesson | undefined, subjectName: (id: string) => string): string[] {
  const parts: string[] = [];
  if (patch.subjectId !== undefined && patch.subjectId !== before?.subjectId) parts.push(subjectName(patch.subjectId));
  if (before) {
    const start = patch.start ?? before.start;
    const end = patch.end ?? before.end;
    if (start !== before.start || end !== before.end) parts.push(timeRange(start, end));
  } else if (patch.start !== undefined && patch.end !== undefined) {
    parts.push(timeRange(patch.start, patch.end));
  } else if (patch.start !== undefined) {
    parts.push(`с ${patch.start}`);
  } else if (patch.end !== undefined) {
    parts.push(`до ${patch.end}`);
  }
  if (patch.room !== undefined || patch.rooms !== undefined) {
    const room = roomText(patch);
    if (!before || room !== roomText(before)) parts.push(formatRoom(room) || 'без кабинета');
  }
  return parts;
}

/**
 * Одна строка про изменение для списков:
 * «Отменена пара: МСС, 09:00», «Замена в 11:55: История → каб. 12»,
 * «Добавлена пара: Практика, 09:00–14:40», «Пар нет весь день: День народного единства».
 * src нужен, чтобы назвать предмет отменённой или заменённой пары; без него — только время.
 */
export function describeOverride(o: DateOverride, subjectName: (id: string) => string, src?: ScheduleSources): string {
  const note = text(o.note);
  if (o.action === 'cancelDay') return note ? `Пар нет весь день: ${note}` : 'Пар нет весь день';

  let main: string;
  if (o.action === 'add') {
    const room = formatRoom(roomText(o.lesson));
    main = `Добавлена пара: ${subjectName(o.lesson.subjectId)}, ${timeRange(o.lesson.start, o.lesson.end)}${room ? `, ${room}` : ''}`;
  } else {
    const before = src ? lessonBefore(o, src) : undefined;
    if (o.action === 'cancel') {
      main = before ? `Отменена пара: ${subjectName(before.subjectId)}, ${o.target}` : `Отменена пара в ${o.target}`;
    } else {
      const parts = replaceParts(o.lesson, before, subjectName).join(', ');
      if (before) main = `Замена в ${o.target}: ${subjectName(before.subjectId)}${parts ? ` → ${parts}` : ''}`;
      else main = parts ? `Замена в ${o.target}: ${parts}` : `Замена пары в ${o.target}`;
    }
  }
  // В подписи пары уже есть двоеточие — причину отделяем тире, чтобы не было «…: …: …».
  return note ? `${main} — ${note}` : main;
}

/** «19–31 октября», «28 октября – 3 ноября», один день — «5 ноября». */
export function describePeriodDates(p: Pick<SchedulePeriod, 'from' | 'to'>): string {
  if (!isValidDate(p.from) || !isValidDate(p.to)) return `${p.from} – ${p.to}`;
  return formatDateRange(p.from, p.to);
}

const DAY_SHORT: Record<WeekdayKey, string> = {
  mon: 'пн', tue: 'вт', wed: 'ср', thu: 'чт', fri: 'пт', sat: 'сб', sun: 'вс',
};

/** «пн–пт», «пн, ср, пт», «пн–ср, пт»: подряд идущие дни (от трёх) — через тире. */
export function describeWeekdays(days: readonly WeekdayKey[]): string {
  const idx = orderedDays(days).map((k) => WEEKDAY_KEYS.indexOf(k));
  const out: string[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    if (j - i >= 2) out.push(`${DAY_SHORT[WEEKDAY_KEYS[idx[i]]]}–${DAY_SHORT[WEEKDAY_KEYS[idx[j]]]}`);
    else for (let k = i; k <= j; k++) out.push(DAY_SHORT[WEEKDAY_KEYS[idx[k]]]);
    i = j + 1;
  }
  return out.join(', ');
}

/** Сколько дней с from по to (включительно) приходится на выбранные дни недели. */
export function countWeekdays(from: DateStr, to: DateStr, days: readonly WeekdayKey[]): number {
  if (!isValidDate(from) || !isValidDate(to) || to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (days.includes(weekdayKey(d))) n++;
  return n;
}

/** «2 недели» по календарным неделям; если всё внутри одной недели — «5 дней». */
function spanText(from: DateStr, to: DateStr): string {
  const weeks = diffDays(startOfWeek(from), startOfWeek(to)) / 7 + 1;
  if (weeks > 1) return `${weeks} ${plural(weeks, 'неделя', 'недели', 'недель')}`;
  const days = diffDays(from, to) + 1;
  return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

/** Сводка шаблона «Практика»: «Каждый пн–пт 09:00–14:40, каб. 8 — 2 недели, 10 занятий». */
export function describePractice(spec: PracticeSpec, from: DateStr, to: DateStr): string {
  if (!spec.days.length) return 'Не выбраны дни недели';
  const room = formatRoom(text(spec.room));
  const head = `Каждый ${describeWeekdays(spec.days)} ${timeRange(spec.start, spec.end)}${room ? `, ${room}` : ''}`;
  if (!isValidDate(from) || !isValidDate(to) || to < from) return head;
  const n = countWeekdays(from, to, spec.days);
  return `${head} — ${spanText(from, to)}, ${n} ${plural(n, 'занятие', 'занятия', 'занятий')}`;
}

// ——— Проверка ввода ———

const ROOM_MAX = 30;
const NOTE_MAX = 200;
const TITLE_MAX = 60;
const PERIOD_MAX_DAYS = 366;

/** «в понедельник», «во вторник» — для сообщений о дне недели. */
const DAY_IN: Record<WeekdayKey, string> = {
  mon: 'в понедельник', tue: 'во вторник', wed: 'в среду', thu: 'в четверг',
  fri: 'в пятницу', sat: 'в субботу', sun: 'в воскресенье',
};
const DAY_NAME: Record<WeekdayKey, string> = {
  mon: 'Понедельник', tue: 'Вторник', wed: 'Среда', thu: 'Четверг',
  fri: 'Пятница', sat: 'Суббота', sun: 'Воскресенье',
};

/** Ошибки в паре (пустой список — можно сохранять). */
export function validateLessonInput(l: Partial<Lesson>, knownSubject: (id: string) => boolean): string[] {
  const errors: string[] = [];
  if (!isValidTime(l.start) || !isValidTime(l.end)) errors.push('Укажи время начала и конца');
  else if (toMinutes(l.end) < toMinutes(l.start)) errors.push('Пара заканчивается раньше, чем начинается');
  else if (l.end === l.start) errors.push('Начало и конец пары совпадают');
  if (!l.subjectId || !knownSubject(l.subjectId)) errors.push('Выбери предмет');
  const rooms = [l.room, ...(l.rooms ?? [])];
  if (rooms.some((r) => r !== undefined && r.trim().length > ROOM_MAX)) errors.push(`Кабинет — не длиннее ${ROOM_MAX} символов`);
  if (l.note !== undefined && l.note.trim().length > NOTE_MAX) errors.push(`Заметка — не длиннее ${NOTE_MAX} символов`);
  return errors;
}

/** Пересекаются ли пары по времени. Пара, которая начинается ровно в конце предыдущей, — не пересечение. */
export function dayOverlaps(lessons: Pick<Lesson, 'start' | 'end'>[]): boolean {
  const valid = lessons
    .filter((l) => isValidTime(l.start) && isValidTime(l.end))
    .map((l) => [toMinutes(l.start), toMinutes(l.end)] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let maxEnd = -1;
  for (const [start, end] of valid) {
    if (start < maxEnd) return true;
    maxEnd = Math.max(maxEnd, end);
  }
  return false;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Ошибки во временном расписании: название, даты, пары каждого дня. */
export function validatePeriodInput(
  p: Pick<SchedulePeriod, 'title' | 'from' | 'to' | 'week'>,
  knownSubject: (id: string) => boolean,
): string[] {
  const errors: string[] = [];
  const title = p.title.trim();
  if (!title) errors.push('Введи название');
  else if (title.length > TITLE_MAX) errors.push(`Название — не длиннее ${TITLE_MAX} символов`);

  if (!isValidDate(p.from) || !isValidDate(p.to)) errors.push('Укажи даты «с» и «по»');
  else if (p.to < p.from) errors.push('Дата «по» раньше даты «с»');
  else if (diffDays(p.from, p.to) + 1 > PERIOD_MAX_DAYS) errors.push('Период длиннее года');

  for (const key of WEEKDAY_KEYS) {
    const lessons = p.week[key] ?? [];
    lessons.forEach((l, i) => {
      for (const e of validateLessonInput(l, knownSubject)) errors.push(`${DAY_NAME[key]}, пара ${i + 1}: ${lowerFirst(e)}`);
    });
    if (dayOverlaps(lessons)) errors.push(`Пары ${DAY_IN[key]} накладываются по времени`);
  }
  return errors;
}

/** Ошибки в шаблоне «Практика» (пара + хотя бы один день недели). */
export function validatePracticeInput(spec: PracticeSpec, knownSubject: (id: string) => boolean): string[] {
  const errors = validateLessonInput(spec, knownSubject);
  if (!spec.days.length) errors.push('Выбери хотя бы один день недели');
  return errors;
}
