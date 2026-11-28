import bells from '../../data/bells.json';
import { addDays, isValidTime, toMinutes, weekdayIndex } from '../core/time';
import type { Entry, Lesson } from './client';

const counts = () => ({ present: 0, absent: 0, late: 0, excused: 0 });
export type Counts = ReturnType<typeof counts>;
export function counted(c: Counts) {
  return c.present + c.late + c.absent;
}
export function percentage(c: Counts) {
  const total = counted(c);
  return total ? Math.round((1000 * (c.present + c.late)) / total) / 10 : null;
}
function aggregate(records: Entry[], start: string, end: string) {
  const total = counts(),
    days = new Set<string>(),
    subjects = new Map<string, Counts>();
  const weekdays = Array.from({ length: 7 }, counts);
  const loggedDates = Array.from({ length: 7 }, () => new Set<string>());
  const missedDates = Array.from({ length: 7 }, () => new Set<string>());
  let missedMinutes = 0;
  for (const { kind, data } of records) {
    if (kind !== 'attendance') continue;
    const day = String(data.date),
      status = String(data.status);
    if (day < start || day > end || !Object.hasOwn(total, status)) continue;
    const key = status as keyof Counts;
    const subject = String(data.subject);
    days.add(day);
    total[key]++;
    const group = subjects.get(subject) ?? counts();
    group[key]++;
    subjects.set(subject, group);
    const wd = weekdayIndex(day);
    weekdays[wd][key]++;
    if (key !== 'excused') loggedDates[wd].add(day);
    if (key === 'absent') missedDates[wd].add(day);
    if (key === 'absent' && isValidTime(data.start) && isValidTime(data.end))
      missedMinutes += Math.max(0, toMinutes(data.end) - toMinutes(data.start));
  }
  return {
    total,
    days: days.size,
    subjects,
    weekdays,
    missedMinutes,
    weeklyDates: loggedDates.map((dates, i) => ({
      logged: dates.size,
      missed: missedDates[i].size,
    })),
  };
}
export function studyInsights(records: Entry[], end: string, length: number) {
  const start = addDays(end, 1 - length);
  const current = aggregate(records, start, end);
  const previous = aggregate(
    records,
    addDays(start, -length),
    addDays(start, -1),
  );
  return { start, end, current, previous };
}

export interface Preset {
  title: string;
  starts: string[];
}
export function dayPresets(lessons: Lesson[]): Preset[] {
  if (!lessons.length) return [];
  const sorted = [...lessons].sort((a, b) => a.start.localeCompare(b.start));
  const groups: Lesson[][] = [];
  for (const lesson of sorted) {
    const pair = bells.find(
      (b) => lesson.start >= b.start && lesson.start < b.end,
    );
    const last = groups.at(-1);
    if (pair && last && last[0].start >= pair.start && last[0].start < pair.end)
      last.push(lesson);
    else groups.push([lesson]);
  }
  const starts = (items: Lesson[]) => items.map((l) => l.start);
  const choices = [{ title: 'Полный день', starts: [] as string[] }];
  if (groups.length > 1) {
    choices.push({
      title: 'Прийти к ' + groups[1][0].start,
      starts: starts(groups[0]),
    });
    for (const group of groups.slice(0, -1)) {
      const last = group[group.length - 1];
      choices.push({
        title: 'Уйти в ' + last.end,
        starts: starts(sorted.filter((l) => l.start > last.start)),
      });
    }
  }
  choices.push({ title: 'Остаться дома', starts: starts(sorted) });
  return choices;
}

export function trainPresets(d: {
  date: string;
  records: Entry[];
  lessons: Lesson[];
}) {
  const route = d.records.find((r) => r.kind === 'travel')?.data;
  const access =
    Number(route?.metro ?? 28) +
    Number(route?.walk ?? 12) +
    Number(route?.cushion ?? 20);
  return d.records
    .filter(
      (r) =>
        r.kind === 'trip' &&
        r.data.date === d.date &&
        r.data.direction === 'out' &&
        !r.data.cancelled,
    )
    .flatMap((r) => {
      if (!isValidTime(r.data.departure)) return [];
      const departure = toMinutes(r.data.departure) + Number(r.data.delay ?? 0);
      const leave = departure - access;
      if (leave < 0 || !d.lessons.some((l) => toMinutes(l.end) <= leave))
        return [];
      return [
        {
          id: r.id,
          number: String(r.data.number),
          departure,
          leave,
          starts: d.lessons
            .filter((l) => toMinutes(l.end) > leave)
            .map((l) => l.start),
        },
      ];
    })
    .sort((a, b) => a.departure - b.departure);
}
