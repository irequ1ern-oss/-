// Подписи и адреса экранов «Изменения расписания» (без отрисовки — их удобно проверять тестами).

import { describePeriodDates, groupOverridesByDate, periodStatus, type DateGroup } from '../../core/changes';
import { capitalize, formatDayLong, formatDayMonth, formatDuration, formatRoom, plural, weekdayName, weekdayShort } from '../../core/format';
import type { HolidayRow, Holiday } from '../../core/holidays';
import { describeHoliday, isHolidayMark } from '../../core/holidays';
import { lessonRoom, type DateOverride, type Lesson, type PeriodKind, type SchedulePeriod, type ScheduleSources } from '../../core/schedule';
import { addDays, diffDays, isValidDate, isValidTime, startOfWeek, toMinutes, type DateStr, type TimeStr } from '../../core/time';
import type { IconName } from '../../ui/iconData';

// ---------- Даты ----------

/** «Чт, 15 октября» — заголовок шторки дня и строки списка. */
export function dayTitleShort(date: DateStr): string {
  return `${weekdayShort(date)}, ${formatDayMonth(date)}`;
}

/** «Четверг, 15 октября» — заголовок экрана дня. */
export function dayTitleLong(date: DateStr): string {
  return capitalize(formatDayLong(date));
}

/** Дата в поле выбора: «Чт, 15 октября»; другой год — «Пт, 1 января 2027». */
export function fieldDate(date: DateStr, today: DateStr): string {
  if (!isValidDate(date)) return 'Не выбрано';
  const year = date.slice(0, 4);
  return year === today.slice(0, 4) ? dayTitleShort(date) : `${dayTitleShort(date)} ${year}`;
}

/** Понедельник, с которого удобно начать новое расписание: сегодня, если сегодня понедельник, иначе следующий. */
export function nextMonday(today: DateStr): DateStr {
  const monday = startOfWeek(today);
  return monday === today ? today : addDays(monday, 7);
}

/** Даты нового расписания по умолчанию: практика и временное — две недели пн–пт, каникулы — неделя. */
export function defaultPeriodDates(kind: PeriodKind, today: DateStr): { from: DateStr; to: DateStr } {
  const from = nextMonday(today);
  return { from, to: addDays(from, kind === 'break' ? 6 : 11) };
}

/** «12 дней», «1 день» — длина промежутка включительно. */
export function daysCount(from: DateStr, to: DateStr): string {
  if (!isValidDate(from) || !isValidDate(to) || to < from) return '';
  const n = diffDays(from, to) + 1;
  return `${n} ${plural(n, 'день', 'дня', 'дней')}`;
}

// ---------- Адреса экранов ----------

/**
 * Экраны раздела. В адресе настроек помещаются только два уровня (#/settings/changes/…),
 * поэтому вид экрана и его параметр записаны одним словом: day-2026-10-15, period-<id>, new-practice.
 */
export type ChangesRoute =
  | { screen: 'list' }
  | { screen: 'day'; date: DateStr }
  | { screen: 'period'; id: string }
  | { screen: 'new'; kind: PeriodKind };

const KINDS: PeriodKind[] = ['custom', 'practice', 'break'];

/** Путь экрана в настройках: ['changes'], ['changes', 'day-2026-10-15'] … */
export function changesPath(r: ChangesRoute): string[] {
  switch (r.screen) {
    case 'list':
      return ['changes'];
    case 'day':
      return ['changes', `day-${r.date}`];
    case 'period':
      return ['changes', `period-${r.id}`];
    case 'new':
      return ['changes', `new-${r.kind}`];
  }
}

/** Какой экран открыть по второму слову пути; null — адрес испорчен (показываем список). */
export function parseChangesPath(id: string | undefined): ChangesRoute | null {
  if (!id) return { screen: 'list' };
  const m = /^(day|period|new)-(.+)$/.exec(id);
  if (!m) return null;
  if (m[1] === 'day') return isValidDate(m[2]) ? { screen: 'day', date: m[2] } : null;
  if (m[1] === 'period') return { screen: 'period', id: m[2] };
  return (KINDS as string[]).includes(m[2]) ? { screen: 'new', kind: m[2] as PeriodKind } : null;
}

// ---------- Временные расписания ----------

/** Заголовок нового расписания (экран и кнопка «назад»). */
export const NEW_PERIOD_TITLES: Record<PeriodKind, string> = {
  custom: 'Новое расписание',
  practice: 'Практика',
  break: 'Каникулы',
};

/** Что написать в уведомлении после сохранения. */
export function periodSavedText(kind: PeriodKind, isNew: boolean): string {
  if (kind === 'practice') return isNew ? 'Практика добавлена' : 'Практика сохранена';
  if (kind === 'break') return isNew ? 'Каникулы добавлены' : 'Каникулы сохранены';
  return isNew ? 'Временное расписание добавлено' : 'Временное расписание сохранено';
}

/** Плитка строки расписания по виду. */
export function periodTile(kind: PeriodKind | undefined): { icon: IconName; color: string } {
  if (kind === 'practice') return { icon: 'hammer', color: 'brown' };
  if (kind === 'break') return { icon: 'sun', color: 'teal' };
  return { icon: 'swap', color: 'orange' };
}

/** «через 3 дня», «завтра» — сколько ждать начала. */
function startsIn(days: number): string {
  if (days === 1) return 'с завтра';
  if (days % 7 === 0 && days >= 14) {
    const w = days / 7;
    return `через ${w} ${plural(w, 'неделю', 'недели', 'недель')}`;
  }
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

/** Подпись строки расписания: «19–31 октября · действует сейчас», «2–13 ноября · через 23 дня». */
export function periodSubtitle(p: Pick<SchedulePeriod, 'from' | 'to'>, today: DateStr): string {
  const dates = describePeriodDates(p);
  const status = periodStatus(p as SchedulePeriod, today);
  if (status === 'current') return `${dates} · действует сейчас`;
  if (status === 'upcoming') return `${dates} · ${startsIn(diffDays(today, p.from))}`;
  return dates;
}

/** Расписания, с которыми пересекается это (кроме него самого), по дате начала. */
export function overlappingPeriods(
  p: Pick<SchedulePeriod, 'id' | 'from' | 'to'>,
  periods: SchedulePeriod[],
): SchedulePeriod[] {
  if (!isValidDate(p.from) || !isValidDate(p.to) || p.to < p.from) return [];
  return periods.filter((o) => !o.deleted && o.id !== p.id && o.from <= p.to && o.to >= p.from);
}

/** Предупреждение о пересечении: в общие дни действует созданное позже (новое — позже всех). */
export function overlapNote(others: SchedulePeriod[], isNew: boolean, createdAt?: string): string {
  if (!others.length) return '';
  const names = others.map((o) => `«${o.title}» (${describePeriodDates(o)})`).join(', ');
  const winsAll = isNew || others.every((o) => (createdAt ?? '') >= o.createdAt);
  return winsAll
    ? `Пересекается с ${names}. В общие дни будет действовать это расписание.`
    : `Пересекается с ${names}. В общие дни действует то, что создано позже.`;
}

// ---------- Пары ----------

function fromMinutes(m: number): TimeStr {
  const c = Math.max(0, Math.min(23 * 60 + 59, Math.round(m)));
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}

/** Время новой пары: через 10 минут после последней пары дня (1 ч 40 мин, как обычная пара), без пар — 09:00–10:40. */
export function suggestSlot(lessons: Pick<Lesson, 'start' | 'end'>[]): { start: TimeStr; end: TimeStr } {
  const ends = lessons.filter((l) => isValidTime(l.end)).map((l) => toMinutes(l.end));
  if (!ends.length) return { start: '09:00', end: '10:40' };
  const start = Math.min(Math.max(...ends) + 10, 22 * 60);
  return { start: fromMinutes(start), end: fromMinutes(Math.min(start + 100, 23 * 60 + 55)) };
}

/** «1 ч 40 мин» между началом и концом; пусто, если время не задано или конец раньше начала. */
export function lessonLength(start: TimeStr, end: TimeStr): string {
  if (!isValidTime(start) || !isValidTime(end)) return '';
  const d = toMinutes(end) - toMinutes(start);
  return d > 0 ? formatDuration(d) : '';
}

/** Что было до замены: «было: История, каб. 6» (только то, что поменялось). */
export function wasText(
  now: Lesson,
  original: Lesson | undefined,
  subgroup: number,
  subjectName: (id: string) => string,
): string {
  if (!original) return '';
  const parts: string[] = [];
  if (original.subjectId !== now.subjectId) parts.push(subjectName(original.subjectId));
  if (original.start !== now.start || original.end !== now.end) parts.push(`${original.start}–${original.end}`);
  const before = lessonRoom(original, subgroup);
  if (before !== lessonRoom(now, subgroup)) parts.push(formatRoom(before) || 'без кабинета');
  return parts.length ? `было: ${parts.join(', ')}` : '';
}

/** Пояснение к полю «Кабинет», если у подгрупп кабинеты разные. */
export function subgroupRoomsHint(lesson: Pick<Lesson, 'room' | 'rooms'> | undefined): string {
  const rooms = lesson?.rooms?.filter((r) => r);
  if (!rooms || rooms.length < 2 || rooms.every((r) => r === rooms[0])) return '';
  return `У подгрупп разные кабинеты: ${rooms.join(' и ')}. Если поменять кабинет, он станет общим.`;
}

// ---------- Изменения на даты ----------

/**
 * Подпись строки даты: изменения по строке, не больше двух
 * (если больше — вторая строка «и ещё N»).
 */
export function dateLines(lines: string[]): string {
  if (lines.length <= 2) return lines.join('\n');
  const rest = lines.length - 1;
  return `${lines[0]}\nи ещё ${rest} ${plural(rest, 'изменение', 'изменения', 'изменений')}`;
}

/**
 * Даты для группы «Изменения на даты». Впереди не показываем дни, где только отмеченный праздник:
 * они уже есть (с переключателем) в группе «Праздники». Прошедшие — все.
 */
export function listedDateGroups(overrides: DateOverride[], today: DateStr): { upcoming: DateGroup[]; past: DateGroup[]; holidays: number } {
  const { upcoming, past } = groupOverridesByDate(overrides, today);
  const listed = upcoming.filter((g) => !g.overrides.every(isHolidayMark));
  return { upcoming: listed, past, holidays: upcoming.length - listed.length };
}

/** Сколько расписаний и дат с изменениями ещё впереди или действуют сейчас — для строки в «Настройках». */
export function activeChangesCount(src: Pick<ScheduleSources, 'periods' | 'overrides'>, today: DateStr): number {
  const periods = src.periods.filter((p) => !p.deleted && periodStatus(p, today) !== 'past').length;
  return periods + listedDateGroups(src.overrides, today).upcoming.length;
}

// ---------- Праздники ----------

export interface HolidayItem {
  key: string;
  title: string;
  subtitle: string;
  /** Для диктора: «4 ноября, среда — День народного единства». */
  label: string;
  holidays: Holiday[];
  /** Отметки «Пар нет весь день» этих праздников, которые уже есть. */
  marks: DateOverride[];
  /** Отмечены все дни. */
  on: boolean;
}

/** Новогодние каникулы (1–8 января) — одной строкой: шесть одинаковых переключателей подряд ни к чему. */
const isNewYear = (date: DateStr) => date.slice(5, 7) === '01' && date.slice(8) <= '08';

/** Строки группы «Праздники»: каждый праздник отдельно, январские дни одного года — вместе. */
export function holidayItems(rows: HolidayRow[]): HolidayItem[] {
  const items: (HolidayItem | { year: string })[] = [];
  const blocks = new Map<string, HolidayRow[]>();
  for (const row of rows) {
    const d = row.holiday.date;
    if (!isNewYear(d)) {
      items.push(singleItem(row));
      continue;
    }
    const year = d.slice(0, 4);
    const block = blocks.get(year);
    if (block) block.push(row);
    else {
      blocks.set(year, [row]);
      items.push({ year });
    }
  }
  return items.map((it) => ('year' in it ? blockItem(it.year, blocks.get(it.year)!) : it));
}

function singleItem(row: HolidayRow): HolidayItem {
  const h = row.holiday;
  return {
    key: h.date,
    title: h.name,
    subtitle: `${formatDayMonth(h.date)}, ${weekdayName(h.date)}`,
    label: describeHoliday(h),
    holidays: [h],
    marks: row.mark ? [row.mark] : [],
    on: Boolean(row.mark),
  };
}

function blockItem(year: string, rows: HolidayRow[]): HolidayItem {
  if (rows.length === 1) return { ...singleItem(rows[0]), key: `ny-${year}` };
  const first = rows[0].holiday.date;
  const last = rows[rows.length - 1].holiday.date;
  const marks = rows.flatMap((r) => (r.mark ? [r.mark] : []));
  const n = rows.length;
  const dates = `${Number(first.slice(8))}–${formatDayMonth(last)}`;
  return {
    key: `ny-${year}`,
    title: 'Новогодние каникулы',
    subtitle: `${dates} · ${n} ${plural(n, 'учебный день', 'учебных дня', 'учебных дней')}`,
    label: `${dates} — ${rows.some((r) => r.holiday.date.endsWith('-01-07')) ? 'Новогодние каникулы и Рождество' : 'Новогодние каникулы'}`,
    holidays: rows.map((r) => r.holiday),
    marks,
    on: marks.length === n,
  };
}

// ---------- Выбор дня ----------

/** Сколько дней вперёд показывать в выборе дня (дальше — «Другая дата»). */
export const PICK_DAYS = 7;

/** Заголовок строки в выборе дня: «Сегодня», «Завтра», дальше — «Ср, 14 октября». */
export function pickDayTitle(date: DateStr, today: DateStr): string {
  const d = diffDays(today, date);
  if (d === 0) return 'Сегодня';
  if (d === 1) return 'Завтра';
  return dayTitleShort(date);
}

/**
 * Подпись строки в выборе дня: «Пн, 12 октября · 5 пар · 09:00–16:30» (для сегодня и завтра — с датой),
 * «Пар нет весь день», «Пар нет».
 */
export function pickDaySubtitle(
  date: DateStr,
  today: DateStr,
  lessons: Pick<Lesson, 'start' | 'end'>[],
  dayOff: boolean,
): string {
  const d = diffDays(today, date);
  const head = d === 0 || d === 1 ? `${dayTitleShort(date)} · ` : '';
  if (dayOff) return `${head}Пар нет весь день`;
  if (!lessons.length) return `${head}Пар нет`;
  const start = lessons.reduce((m, l) => (toMinutes(l.start) < toMinutes(m) ? l.start : m), lessons[0].start);
  const end = lessons.reduce((m, l) => (toMinutes(l.end) > toMinutes(m) ? l.end : m), lessons[0].end);
  const n = lessons.length;
  return `${head}${n} ${plural(n, 'пара', 'пары', 'пар')} · ${start}–${end}`;
}

/** «Отменятся пары в 3 учебных дня»; пусто — в эти дни пар и так нет. */
export function daysOffSummary(n: number): string {
  if (n <= 0) return '';
  return `Отменятся пары в ${n} ${plural(n, 'учебный день', 'учебных дня', 'учебных дней')}`;
}
